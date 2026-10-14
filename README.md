# STEC contamination in minced beef: raw material allocation and batch mixing

This repository provides R code associated with the raw material allocation and batch mixing component of the model described in **ANSES scientific opinion 2016-SA-0121**.

## Purpose

The model simulates how STEC contamination in beef raw material units can affect the contamination of minced beef batches when these units are distributed and combined during production.

It accounts for the links between raw material units and successive production batches, providing a basis for examining contamination patterns in batches surrounding a contaminated batch.

## Scope

The code focuses on:

- Contamination of beef raw material units.
- Allocation of raw material units to minced beef batches.
- Formation of batches by combining several raw material units.
- Resulting contamination patterns across production batches.

This repository covers this component of the model rather than the complete quantitative microbial risk assessment described in the opinion.

## Scientific background

The approach is described in Section 3.4.2 of ANSES scientific opinion **2016-SA-0121**, *Modélisation de la contamination des matières premières (VPH) et des mêlées de viande hachée*.

In the opinion, **VPH** (*viande pour haché*) refers to beef raw material intended for mincing, and **mêlée** refers to a production batch of minced meat.

## Interpretation

Simulation results should be interpreted in light of the assumptions, input distributions and production scenarios described in the opinion. They represent modelled contamination patterns rather than direct observations of individual production batches.

## Reference

ANSES. Scientific opinion, request No. **2016-SA-0121**, Section 3.4.2 and Annex 3. https://www.anses.fr/system/files/BIORISK2016SA0121.pdf?download=1
