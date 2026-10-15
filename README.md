# STEC contamination in minced beef: raw material allocation and batch mixing

This repository provides R code and data associated with the raw material allocation and batch mixing component of the model described in **ANSES scientific opinion 2016-SA-0121**, together with two interactive pages that explain how raw material boxes (VPH) are made up and how they are mixed into minced beef batches.

In the opinion, **VPH** (*viande pour haché*) refers to beef raw material intended for mincing, and **mêlée** refers to a production batch of minced meat.

## Interactive explainers

Start here to see the principles before reading the code. Both pages are self-contained HTML files in [`docs/`](docs/): download them and open them in a browser, or browse them online once GitHub Pages is enabled for the `docs/` folder (they will then be at `https://lguillier.github.io/stec-beef-batch-mixing/`).

| Page | What it shows |
|---|---|
| [`docs/vph-box-filling.html`](docs/vph-box-filling.html) | **Step 1: contamination of a VPH box.** A 1,000 kg box receives meat pieces from 60 cattle. Piece masses follow a triangular distribution (50, 500, 1,000 g), about 32 pieces per animal. Only pieces from contaminated carcasses are explicitly simulated, and each piece's expected number of bacteria is the carcass load × piece surface / 32,000 cm². Two display modes separate the physical process (schematic) from the contributions the R model actually generates. |
| [`docs/batch-mixing.html`](docs/batch-mixing.html) | **Step 2: mixing boxes into batches.** After Figure 12 of the opinion: each 1,000 kg batch is 60% chilled fatty, 30% chilled lean and 10% frozen VPH, drawn first in, first out, plus 0.1% carry-over from the previous batch. One box usually feeds several successive batches, and a batch can take material from two boxes of the same type, which links the contamination levels of neighbouring batches. |

[`docs/index.html`](docs/index.html) links the two pages in order.

### Rebuilding the explainers

The pages are generated from small JavaScript sources, so the drawings and numbers come from the same model code. With Node.js 20 or later and no other dependency:

```sh
node figure-vph/build.mjs   # writes docs/vph-box-filling.html
node figure/build.mjs       # writes docs/batch-mixing.html
```

- `figure-vph/model.mjs` ports the piece-generation step of `data/generate_vph_contamination.R` (reference piece count, Poisson pieces per carcass, triangular masses, surface ratio, expected bacteria per piece); `live.js` draws and animates the box.
- `figure/model.mjs` holds the allocation of units to batches (60/30/10, first in first out, 0.1% carry-over) and the contamination levels it implies; `scene.mjs` draws the line.
- `vendor/anatomy/` is a copy of the isometric drawing kit of the [anatomy](https://github.com/wheresryan22/anatomy) project (MIT licence), used by both builds.

The pages are simplified visualizations. The contaminated-carcass loads, and the two contaminated carcasses per box shown by default in the first page, are demonstration settings; the number of contaminated carcasses per box in the R model comes from its own prevalence equations.

## Repository structure

```
README.md
data/
  generate_vph_contamination.R   R script generating the contamination of VPH boxes
  vph_contamination.csv          example output (50,000 boxes)
docs/
  index.html                     entry page for the explainers
  vph-box-filling.html           step 1: from 60 carcasses to one VPH box
  batch-mixing.html              step 2: VPH boxes into eight successive batches
figure-vph/                      sources of docs/vph-box-filling.html
figure/                          sources of docs/batch-mixing.html (preview/ has screenshots)
vendor/anatomy/                  isometric drawing kit used by the builds (MIT)
```

## Data: contamination of VPH boxes

[`data/generate_vph_contamination.R`](data/generate_vph_contamination.R) generates the expected STEC contamination of 1,000 kg VPH boxes using the VPH3 calculation of the opinion, for the high-shedding period (faecal concentration mean 2.44 and sd 1.98 log10 CFU/g, faecal shedding prevalence 3.9%). For each simulated box it:

1. draws a reference number of meat pieces per box, by sampling piece masses from a triangular distribution (min 50 g, mode 500 g, max 1,000 g) until 1,000 kg is reached (drawn once per run);
2. derives the probability that a carcass is contaminated through the hide (transfer from faeces to hide, then hide to carcass) or through evisceration accidents, and draws the number of contaminated carcasses among the 60 animals of the box;
3. computes the bacterial load of each contaminated carcass (hide soiling spots and diffuse soiling after trimming, visceral contents), of which a fraction of 0.75 to 0.90 goes to meat for mincing;
4. draws, for each contaminated carcass, a Poisson number of pieces with mean (reference count / 60), their masses, and a surface-to-mass ratio between 0.1 and 0.5 cm²/g;
5. computes the expected number of bacteria per piece as carcass load × piece surface / 32,000 cm², and sums it per box.

Only contaminated carcasses' pieces are generated explicitly; the box mass is fixed at 1,000 kg by definition. The script requires the R packages `Hmisc`, `dplyr` and `tibble`, uses `set.seed(1234567)` and writes `vph_contamination.csv` to the working directory:

```r
install.packages(c("Hmisc", "dplyr", "tibble"))
source("data/generate_vph_contamination.R")
```

[`data/vph_contamination.csv`](data/vph_contamination.csv) is an example output with one row per box:

| Column | Description |
|---|---|
| `vph_id` | Box identifier: `G00001`–`G30000` chilled fatty, `M00001`–`M15000` chilled lean, `C00001`–`C05000` frozen |
| `type` | `fat`, `lean` or `frozen` (30,000 / 15,000 / 5,000 boxes, for the 60/30/10 mixing scenario of Figure 12) |
| `mass_g` | Box mass, 1,000,000 g |
| `expected_cfu` | Expected number of STEC in the box (decimal) |
| `cfu` | One Poisson draw around `expected_cfu` (integer count) |

All three types share the same upstream contamination distribution; the type labels only prepare the boxes for the mixing step. In this example the median expected count is about 31 CFU per box, the 90th percentile about 1,700 and the 99th percentile about 105,000, and 4,503 boxes (9%) have an integer count of 0.

## Scope

The code focuses on:

- Contamination of beef raw material units.
- Allocation of raw material units to minced beef batches.
- Formation of batches by combining several raw material units.
- Resulting contamination patterns across production batches.

This repository covers this component of the model rather than the complete quantitative microbial risk assessment described in the opinion. The data script does not include mixing, sampling, carry-over or risk assessment.

## Scientific background

The approach is described in Section 3.4.2 of ANSES scientific opinion **2016-SA-0121**, *Modélisation de la contamination des matières premières (VPH) et des mêlées de viande hachée*, and the mixing scenario in Section 3.4.6 (Figure 12).

## Interpretation

Simulation results should be interpreted in light of the assumptions, input distributions and production scenarios described in the opinion. They represent modelled contamination patterns rather than direct observations of individual production batches.

## Reference

ANSES. Scientific opinion, request No. **2016-SA-0121**, Sections 3.4.2 and 3.4.6, and Annex 3. https://www.anses.fr/system/files/BIORISK2016SA0121.pdf?download=1
