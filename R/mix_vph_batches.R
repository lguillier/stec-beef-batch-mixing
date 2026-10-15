# Mix VPH boxes into minced beef batches (mêlées) and evaluate detection.
#
# Scenario of ANSES opinion 2016-SA-0121, section 3.4.6 (Figures 12 to 15):
#   - each 1,000 kg batch contains 60% chilled fatty (R-G), 30% chilled lean (R-M)
#     and 10% frozen (C) VPH, drawn from 1,000 kg boxes first in, first out;
#   - a box is used in as many successive batches as needed until it is empty, so a
#     batch can contain two boxes of the same type;
#   - 1/1000 of each batch's mass is carried over into the next batch;
#   - every batch is sampled once (n = 1, absence in 25 g), with a Gamma-Poisson
#     distribution of bacteria in the batch (heterogeneity coefficient b, Equation 7).
#
# Input : data/vph_contamination.csv (from data/generate_vph_contamination.R)
# Output: output/batches.csv, output/summary.csv and figures/fig13-15 (PNG)
#
# Run from the repository root:  Rscript R/mix_vph_batches.R
# Install once if needed: install.packages(c("dplyr", "ggplot2"))

library(dplyr)
library(ggplot2)

set.seed(20161211)

# ---- parameters ---------------------------------------------------------------------
input_file <- "data/vph_contamination.csv"
batch_kg   <- 1000                                # mass of a batch (MM)
unit_kg    <- 1000                                # mass of a VPH box (MVPH)
recipe_kg  <- c(fat = 600, lean = 300, frozen = 100)
carry_over <- 0.001                               # fraction of a batch left for the next
sample_g   <- 25                                  # test portion
b_range    <- c(0.5, 2)                           # heterogeneity b, uniform per batch
n_enhanced <- 30                                  # samples on neighbouring batches
far_lag    <- 5                                   # "distant" batches: at least 5 away
n_plot     <- 150                                 # batches shown in Figures 13 and 14
# "binomial": integer counts (column cfu) are split between batches by binomial
# thinning, so a batch receives whole bacteria; "expected": the expected numbers
# (column expected_cfu) are split in proportion to mass.
split_mode <- "binomial"

dir.create("output", showWarnings = FALSE)
dir.create("figures", showWarnings = FALSE)

# ---- data ---------------------------------------------------------------------------
vph <- read.csv(input_file, stringsAsFactors = FALSE)
stopifnot(all(c("vph_id", "type", "mass_g", "expected_cfu", "cfu") %in% names(vph)),
          all(vph$mass_g == unit_kg * 1000))

units_needed <- recipe_kg / unit_kg               # boxes used per batch, by type
n_batches <- min(floor(table(vph$type)[names(recipe_kg)] / units_needed))
message("Batches that can be made from the boxes in the file: ", n_batches)

# ---- allocation of the boxes of one type to successive batches ----------------------
# Returns, for each batch, the bacteria received from this type and the boxes used.
allocate <- function(units, take_kg, n_batches, mode) {
  load <- if (mode == "binomial") as.numeric(units$cfu) else units$expected_cfu
  fresh <- numeric(n_batches)
  used <- character(n_batches)
  i <- 1
  left_kg <- unit_kg
  left_n <- load[1]
  for (k in seq_len(n_batches)) {
    need <- take_kg
    parts <- character(0)
    while (need > 1e-9) {
      take <- min(need, left_kg)
      share <- take / left_kg
      x <- if (mode == "binomial") rbinom(1, left_n, share) else left_n * share
      fresh[k] <- fresh[k] + x
      parts <- c(parts, sprintf("%s:%g", units$vph_id[i], take))
      left_n <- left_n - x
      left_kg <- left_kg - take
      need <- need - take
      if (left_kg <= 1e-9) {
        i <- i + 1
        left_kg <- unit_kg
        left_n <- if (i <= nrow(units)) load[i] else 0
      }
    }
    used[k] <- paste(parts, collapse = ";")
  }
  list(fresh = fresh, used = used)
}

mix <- lapply(names(recipe_kg), function(t) {
  allocate(vph[vph$type == t, ], recipe_kg[[t]], n_batches, split_mode)
})
names(mix) <- names(recipe_kg)

# ---- carry-over between successive batches ------------------------------------------
fresh <- mix$fat$fresh + mix$lean$fresh + mix$frozen$fresh
N <- numeric(n_batches)
carried_in <- numeric(n_batches)
carry <- 0
for (k in seq_len(n_batches)) {
  in_mixer <- fresh[k] + carry
  carried_in[k] <- carry
  carry <- if (split_mode == "binomial") rbinom(1, in_mixer, carry_over) else in_mixer * carry_over
  N[k] <- in_mixer - carry                        # what leaves the mixer in batch k
}

# ---- detection: n = 1, absence in 25 g (Equation 7) --------------------------------
p_detect <- function(N, b, n = 1) {
  mu <- N / (batch_kg * 1000) * sample_g          # mean count in one test portion
  1 - (b / (mu + b))^(b * n)
}
b <- runif(n_batches, b_range[1], b_range[2])
p1 <- p_detect(N, b)
detected <- runif(n_batches) < p1

batches <- tibble(
  batch = seq_len(n_batches),
  cfu = N,
  log10_cfu = ifelse(N > 0, log10(N), NA_real_),
  carried_in = carried_in,
  fat_units = mix$fat$used,
  lean_units = mix$lean$used,
  frozen_units = mix$frozen$used,
  b = b,
  p_detect = p1,
  detected = detected
)
write.csv(batches, "output/batches.csv", row.names = FALSE)

# ---- neighbours of detected batches -------------------------------------------------
pos <- which(detected)
near_pos <- function(k) any(abs(pos - k) < far_lag)
pick <- function(lag, distant = FALSE) {
  k <- pos + lag
  k <- k[k >= 1 & k <= n_batches]
  if (distant) k <- k[!vapply(k, near_pos, logical(1))]
  k
}
groups <- bind_rows(
  tibble(group = "Detected batches",              line = "solid",  batch = pos),
  tibble(group = "Batch just before (m-1)",       line = "dashed", batch = pick(-1)),
  tibble(group = "Batch just after (m+1)",        line = "solid",  batch = pick(+1)),
  tibble(group = "Distant, before (m-5)",         line = "dashed", batch = pick(-far_lag, TRUE)),
  tibble(group = "Distant, after (m+5)",          line = "solid",  batch = pick(+far_lag, TRUE))
) %>%
  left_join(select(batches, batch, cfu, b), by = "batch") %>%
  mutate(log10_cfu = ifelse(cfu > 0, log10(cfu), NA_real_))

neighbours <- c(pick(-1), pick(+1))
p_enhanced <- mean(p_detect(N[neighbours], b[neighbours], n_enhanced))

summary_tbl <- groups %>%
  group_by(group) %>%
  summarise(batches = n(),
            median_cfu = median(cfu),
            median_log10_cfu = median(log10_cfu, na.rm = TRUE),
            share_zero = mean(cfu == 0),
            .groups = "drop") %>%
  bind_rows(tibble(group = "All batches", batches = n_batches,
                   median_cfu = median(N), median_log10_cfu = median(log10(N[N > 0])),
                   share_zero = mean(N == 0)))
write.csv(summary_tbl, "output/summary.csv", row.names = FALSE)

message(sprintf("Detected batches (n = 1, 25 g): %d of %d (%.2f%%; opinion: 2.7%%)",
                length(pos), n_batches, 100 * mean(detected)))
message(sprintf("Mean detection probability of m-1 and m+1 with n = %d: %.0f%% (opinion: 66%%)",
                n_enhanced, 100 * p_enhanced))
med <- setNames(summary_tbl$median_cfu, summary_tbl$group)
message(sprintf("Median cfu, detected / distant (m+5): %.0f / %.0f (ratio %.0f; opinion: about 100)",
                med[["Detected batches"]], med[["Distant, after (m+5)"]],
                med[["Detected batches"]] / med[["Distant, after (m+5)"]]))
print(summary_tbl)

# ---- figures ------------------------------------------------------------------------
first <- batches %>%
  slice_head(n = n_plot) %>%
  mutate(detection = factor(ifelse(detected, "D", "ND"), levels = c("D", "ND")))
colours <- c(D = "#F8766D", ND = "#00BFC4")

fig13 <- ggplot(filter(first, cfu > 0), aes(batch, log10_cfu, colour = detection)) +
  geom_point(size = 1.6) +
  scale_colour_manual(values = colours, drop = FALSE) +
  labs(x = "Batch order", y = "log10(cfu/batch)", colour = "detection",
       title = sprintf("Contamination of %d successive 1,000 kg batches", n_plot),
       caption = "Red: EHEC detected by systematic sampling of batches (n = 1, m = 25 g).") +
  theme_gray(base_size = 12)
ggsave("figures/fig13_batch_contamination.png", fig13, width = 7, height = 4.5, dpi = 150)

fig14 <- ggplot(first, aes(batch, p_detect, colour = detection)) +
  geom_point(size = 1.6) +
  scale_colour_manual(values = colours, drop = FALSE) +
  labs(x = "Batch order", y = "Probability of detection", colour = "detection",
       title = sprintf("Probability of detection of %d successive 1,000 kg batches", n_plot),
       caption = "n = 1, m = 25 g, Gamma-Poisson distribution with b drawn in [0.5, 2].") +
  theme_gray(base_size = 12)
ggsave("figures/fig14_detection_probability.png", fig14, width = 7, height = 4.5, dpi = 150)

group_levels <- c("Detected batches", "Batch just before (m-1)", "Batch just after (m+1)",
                  "Distant, before (m-5)", "Distant, after (m+5)")
fig15 <- ggplot(filter(groups, cfu > 0),
                aes(log10_cfu, colour = factor(group, group_levels),
                    linetype = factor(group, group_levels))) +
  stat_ecdf(linewidth = 0.7) +
  scale_colour_manual(values = c("red", "orange", "orange", "black", "black")) +
  scale_linetype_manual(values = c("solid", "dashed", "solid", "dashed", "solid")) +
  labs(x = "log10(cfu) per batch", y = "CDF", colour = NULL, linetype = NULL,
       title = "Contamination of detected batches and of their neighbours") +
  theme_gray(base_size = 12) +
  theme(legend.position = "bottom") +
  guides(colour = guide_legend(nrow = 2))
ggsave("figures/fig15_cdf_neighbours.png", fig15, width = 7, height = 5, dpi = 150)

message("Written: output/batches.csv, output/summary.csv, figures/fig13-15")
