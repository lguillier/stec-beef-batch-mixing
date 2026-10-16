# Mix VPH boxes into minced beef batches (mêlées) and evaluate detection.
#
# Scenario of ANSES opinion 2016-SA-0121, section 3.4.6 (Figures 12 to 15):
#   - each batch contains 60% chilled fatty (R-G), 30% chilled lean (R-M) and 10% frozen
#     (C) VPH, drawn from the boxes first in, first out;
#   - a box is used in as many successive batches as needed until it is empty, so a batch
#     can contain two boxes of the same type; boxes keep their own mass (column mass_g),
#     which need not equal the batch mass;
#   - the mixer keeps a residue of carry_over x batch mass after each discharge, which
#     goes into the next batch;
#   - every batch is sampled once (n = 1, absence in 25 g), with a Gamma-Poisson
#     distribution of bacteria in the batch (heterogeneity coefficient b, Equation 7).
#
# Mass balance. The mixer always holds batch_kg + residue before discharge: the first
# batch takes batch_kg + residue of fresh VPH, the following ones batch_kg. Every batch
# leaves at exactly batch_kg and the residue stays in the mixer at the end. Bacteria
# follow the mass: a box gives the batches the share of its bacteria that matches the
# mass taken, and the residue keeps residue / (batch_kg + residue) of the mixer's
# bacteria. Both balances are checked at the end of the run.
#
# Input : data/vph_contamination.csv (from data/generate_vph_contamination.R)
# Output: output/batches.csv, output/summary.csv, output/balance.csv, figures/fig13-15
#
# Run from the repository root:  Rscript R/mix_vph_batches.R
# Parameters can be changed below or on the command line, for example:
#   Rscript R/mix_vph_batches.R batch_kg=500 b=2      (default: batch_kg=1000, b=1)
#   Rscript R/mix_vph_batches.R b_mode=uniform b_min=0.5 b_max=2
# Install once if needed: install.packages(c("dplyr", "ggplot2"))

library(dplyr)
library(ggplot2)

# ---- parameters ---------------------------------------------------------------------
params <- list(
  input_file = "data/vph_contamination.csv",
  batch_kg   = 1000,                               # mass of a batch leaving the mixer (MM)
  carry_over = 0.001,                              # mixer residue, fraction of batch_kg
  sample_g   = 25,                                 # test portion
  b_mode     = "fixed",                            # "fixed" or "uniform"
  b          = 1,                                  # heterogeneity b when b_mode = "fixed"
  b_min      = 0.5,                                # range when b_mode = "uniform"
  b_max      = 2,
  n_enhanced = 30,                                 # samples on neighbouring batches
  far_lag    = 5,                                  # "distant" batches: at least 5 away
  n_plot     = 150,                                # batches shown in Figures 13 and 14
  zero_at    = -1,                                 # log10 axis position of batches with 0 cfu
  # "binomial": integer counts (column cfu) are split by binomial thinning, so every
  # batch receives whole bacteria; "expected": expected numbers (column expected_cfu)
  # are split in proportion to mass.
  split_mode = "binomial",
  seed       = 20161211
)
recipe <- c(fat = 0.6, lean = 0.3, frozen = 0.1)  # mass shares of fresh VPH per batch

# key=value arguments override the defaults
for (arg in commandArgs(trailingOnly = TRUE)) {
  kv <- strsplit(arg, "=", fixed = TRUE)[[1]]
  if (length(kv) != 2 || !kv[1] %in% names(params)) stop("Unknown argument: ", arg)
  params[[kv[1]]] <- if (is.numeric(params[[kv[1]]])) as.numeric(kv[2]) else kv[2]
}
batch_kg <- params$batch_kg
residue_kg <- params$carry_over * batch_kg
split_mode <- params$split_mode
stopifnot(batch_kg > 0, residue_kg >= 0, abs(sum(recipe) - 1) < 1e-12,
          split_mode %in% c("binomial", "expected"), params$b_mode %in% c("fixed", "uniform"))
set.seed(params$seed)

dir.create("output", showWarnings = FALSE)
dir.create("figures", showWarnings = FALSE)

# ---- data ---------------------------------------------------------------------------
vph <- read.csv(params$input_file, stringsAsFactors = FALSE)
stopifnot(all(c("vph_id", "type", "mass_g", "expected_cfu", "cfu") %in% names(vph)),
          all(vph$mass_g > 0), all(names(recipe) %in% vph$type))
vph$mass_kg <- vph$mass_g / 1000
load_of <- function(units) if (split_mode == "binomial") as.numeric(units$cfu) else units$expected_cfu

# Fresh VPH taken by batch k: batch_kg, plus the future residue for the first batch.
fresh_kg <- function(k) batch_kg + ifelse(k == 1, residue_kg, 0)

# As many batches as the scarcest type allows.
available_kg <- tapply(vph$mass_kg, vph$type, sum)[names(recipe)]
n_batches <- floor(min((available_kg / recipe - residue_kg) / batch_kg) + 1e-9)
stopifnot(n_batches >= 1)
message(sprintf("Batches of %g kg that can be made from the boxes in the file: %d",
                batch_kg, n_batches))

# ---- allocation of the boxes of one type to successive batches ----------------------
# For each batch: the bacteria received from this type, the mass taken and the boxes
# used. Also returns what is left in the boxes that were opened or not used at all.
allocate <- function(units, share, n_batches) {
  load <- load_of(units)
  bact <- numeric(n_batches)
  mass <- numeric(n_batches)
  used <- character(n_batches)
  i <- 1
  left_kg <- units$mass_kg[1]
  left_n <- load[1]
  for (k in seq_len(n_batches)) {
    need <- share * fresh_kg(k)
    parts <- character(0)
    while (need > 1e-9) {
      if (i > nrow(units)) stop("Not enough boxes of type ", units$type[1])
      take <- min(need, left_kg)
      x <- if (split_mode == "binomial") rbinom(1, left_n, take / left_kg) else left_n * take / left_kg
      bact[k] <- bact[k] + x
      mass[k] <- mass[k] + take
      parts <- c(parts, sprintf("%s:%.4g", units$vph_id[i], take))
      left_n <- left_n - x
      left_kg <- left_kg - take
      need <- need - take
      if (left_kg <= 1e-9) {                       # box empty: open the next one
        i <- i + 1
        left_kg <- if (i <= nrow(units)) units$mass_kg[i] else 0
        left_n <- if (i <= nrow(units)) load[i] else 0
      }
    }
    used[k] <- paste(parts, collapse = ";")
  }
  rest <- if (i < nrow(units)) seq(i + 1, nrow(units)) else integer(0)
  list(bact = bact, mass = mass, used = used,
       unused_kg = left_kg + sum(units$mass_kg[rest]),
       unused_n = left_n + sum(load[rest]))
}

mix <- lapply(names(recipe), function(t) allocate(vph[vph$type == t, ], recipe[[t]], n_batches))
names(mix) <- names(recipe)

# ---- mixer: carry-over between successive batches ------------------------------------
fresh_bact <- Reduce(`+`, lapply(mix, `[[`, "bact"))
fresh_mass <- Reduce(`+`, lapply(mix, `[[`, "mass"))
N <- numeric(n_batches)
carried_in <- numeric(n_batches)
mass_out <- numeric(n_batches)
res_n <- 0                                          # bacteria in the mixer residue
res_kg <- 0
keep <- residue_kg / (batch_kg + residue_kg)        # share of the mixer kept as residue
for (k in seq_len(n_batches)) {
  in_n <- fresh_bact[k] + res_n
  in_kg <- fresh_mass[k] + res_kg
  carried_in[k] <- res_n
  res_n <- if (split_mode == "binomial") rbinom(1, in_n, keep) else in_n * keep
  res_kg <- residue_kg
  N[k] <- in_n - res_n
  mass_out[k] <- in_kg - res_kg
}

# ---- mass and bacteria balance ------------------------------------------------------
total_kg <- sum(vph$mass_kg[vph$type %in% names(recipe)])
total_n <- sum(load_of(vph[vph$type %in% names(recipe), ]))
unused_kg <- sum(vapply(mix, `[[`, numeric(1), "unused_kg"))
unused_n <- sum(vapply(mix, `[[`, numeric(1), "unused_n"))
balance <- tibble(
  quantity = c("mass_kg", "bacteria"),
  in_boxes = c(total_kg, total_n),
  in_batches = c(sum(mass_out), sum(N)),
  in_mixer_residue = c(res_kg, res_n),
  left_in_boxes = c(unused_kg, unused_n)
) %>%
  mutate(difference = in_boxes - in_batches - in_mixer_residue - left_in_boxes)
write.csv(balance, "output/balance.csv", row.names = FALSE)
print(balance)
stopifnot(abs(balance$difference[1]) < 1e-6 * total_kg,
          abs(balance$difference[2]) <= 1e-9 * max(1, total_n),
          all(abs(mass_out - batch_kg) < 1e-6),
          all(abs(fresh_mass - vapply(seq_len(n_batches), fresh_kg, numeric(1))) < 1e-6))
message(sprintf("Mass balance: every batch leaves at %g kg; %g kg stay in the mixer, %.1f kg in the boxes.",
                batch_kg, res_kg, unused_kg))

# ---- detection: n = 1, absence in 25 g (Equation 7) --------------------------------
p_detect <- function(N, b, n = 1) {
  mu <- N / (batch_kg * 1000) * params$sample_g    # mean count in one test portion
  1 - (b / (mu + b))^(b * n)
}
b <- if (params$b_mode == "fixed") rep(params$b, n_batches) else runif(n_batches, params$b_min, params$b_max)
p1 <- p_detect(N, b)
detected <- runif(n_batches) < p1
b_label <- if (params$b_mode == "fixed") sprintf("b = %g", params$b) else sprintf("b drawn in [%g, %g]", params$b_min, params$b_max)

batches <- tibble(
  batch = seq_len(n_batches),
  cfu = N,
  log10_cfu = ifelse(N > 0, log10(N), NA_real_),
  mass_kg = mass_out,
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
near_pos <- function(k) any(abs(pos - k) < params$far_lag)
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
  tibble(group = "Distant, before (m-5)",         line = "dashed", batch = pick(-params$far_lag, TRUE)),
  tibble(group = "Distant, after (m+5)",          line = "solid",  batch = pick(+params$far_lag, TRUE))
) %>%
  left_join(select(batches, batch, cfu, b), by = "batch") %>%
  mutate(log10_cfu = ifelse(cfu > 0, log10(cfu), NA_real_))

neighbours <- c(pick(-1), pick(+1))
p_enhanced <- mean(p_detect(N[neighbours], b[neighbours], params$n_enhanced))

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
                params$n_enhanced, 100 * p_enhanced))
med <- setNames(summary_tbl$median_cfu, summary_tbl$group)
message(sprintf("Median cfu, detected / distant (m+5): %.0f / %.0f (ratio %.0f; opinion: about 100)",
                med[["Detected batches"]], med[["Distant, after (m+5)"]],
                med[["Detected batches"]] / med[["Distant, after (m+5)"]]))
print(summary_tbl)

# ---- figures ------------------------------------------------------------------------
first <- batches %>%
  slice_head(n = params$n_plot) %>%
  mutate(detection = factor(ifelse(detected, "D", "ND"), levels = c("D", "ND")))
colours <- c(D = "#F8766D", ND = "#00BFC4")
# log10(0) does not exist: batches without STEC are drawn at zero_at, labelled "0 cfu".
zero_at <- params$zero_at
log_or_zero <- function(cfu) ifelse(cfu > 0, log10(cfu), zero_at)
log_breaks <- function(lims) {
  top <- ceiling(max(lims, na.rm = TRUE))
  steps <- if (top > 5) seq(0, top, 2) else seq(0, top, 1)
  c(zero_at, steps[steps > zero_at + 0.5])
}
log_labels <- function(br) ifelse(br == zero_at, "0 cfu", format(br))

first <- mutate(first, y = log_or_zero(cfu),
                content = factor(ifelse(cfu > 0, "STEC present", "0 cfu"), levels = c("STEC present", "0 cfu")))
n_zero_first <- sum(first$cfu == 0)
fig13 <- ggplot(first, aes(batch, y, colour = detection, shape = content)) +
  geom_hline(yintercept = zero_at, colour = "grey60", linewidth = 0.3, linetype = "dotted") +
  geom_point(size = 1.6) +
  scale_colour_manual(values = colours, drop = FALSE) +
  scale_shape_manual(values = c("STEC present" = 16, "0 cfu" = 4), drop = FALSE) +
  scale_y_continuous(breaks = log_breaks, labels = log_labels,
                     limits = c(zero_at - 0.2, NA)) +
  labs(x = "Batch order", y = "log10(cfu/batch)", colour = "detection", shape = NULL,
       title = sprintf("Contamination of %d successive %g kg batches", params$n_plot, batch_kg),
       caption = sprintf("Red: EHEC detected by systematic sampling of batches (n = 1, m = 25 g).\nCrosses at \"0 cfu\": batches without STEC (%d here).",
                         n_zero_first)) +
  theme_gray(base_size = 12) + theme(plot.caption = element_text(hjust = 0))
ggsave("figures/fig13_batch_contamination.png", fig13, width = 7, height = 4.5, dpi = 150)

fig14 <- ggplot(first, aes(batch, p_detect, colour = detection)) +
  geom_point(size = 1.6) +
  scale_colour_manual(values = colours, drop = FALSE) +
  labs(x = "Batch order", y = "Probability of detection", colour = "detection",
       title = sprintf("Probability of detection of %d successive %g kg batches", params$n_plot, batch_kg),
       caption = sprintf("n = 1, m = 25 g, Gamma-Poisson distribution, %s.", b_label)) +
  theme_gray(base_size = 12) + theme(plot.caption = element_text(hjust = 0))
ggsave("figures/fig14_detection_probability.png", fig14, width = 7, height = 4.5, dpi = 150)

group_levels <- c("Detected batches", "Batch just before (m-1)", "Batch just after (m+1)",
                  "Distant, before (m-5)", "Distant, after (m+5)")
zero_share <- groups %>% group_by(group) %>% summarise(z = mean(cfu == 0), .groups = "drop")
fig15 <- ggplot(mutate(groups, x = log_or_zero(cfu)),
                aes(x, colour = factor(group, group_levels),
                    linetype = factor(group, group_levels))) +
  stat_ecdf(linewidth = 0.7) +
  scale_colour_manual(values = c("red", "orange", "orange", "black", "black")) +
  scale_linetype_manual(values = c("solid", "dashed", "solid", "dashed", "solid")) +
  geom_vline(xintercept = zero_at, colour = "grey60", linewidth = 0.3, linetype = "dotted") +
  scale_x_continuous(breaks = log_breaks, labels = log_labels) +
  labs(x = "log10(cfu) per batch", y = "CDF", colour = NULL, linetype = NULL,
       title = "Contamination of detected batches and of their neighbours",
       caption = sprintf("Batches without STEC are counted at \"0 cfu\", so each curve starts at their share:\n%s.",
                         paste(sprintf("%s %.2f%%", c("m-1", "m+1", "m-5", "m+5"),
                                       100 * zero_share$z[match(group_levels[-1], zero_share$group)]),
                               collapse = ", "))) +
  theme_gray(base_size = 12) + theme(plot.caption = element_text(hjust = 0)) +
  theme(legend.position = "bottom") +
  guides(colour = guide_legend(nrow = 2))
ggsave("figures/fig15_cdf_neighbours.png", fig15, width = 7, height = 5, dpi = 150)

message("Written: output/batches.csv, output/summary.csv, output/balance.csv, figures/fig13-15")
