# Generate vph_contamination.csv from the VPH3 contamination model.
# Original calculation block retained (including 1 + Poisson(10)).
# No risk assessment, mixing, sampling or carry-over.
# Install once if needed: install.packages(c("Hmisc", "dplyr", "tibble"))
library(Hmisc)
library(dplyr)
library(tibble)

set.seed(1234567)
runs <- 50000L
n <- 60
tailleVPH <- 1E6 # Total mass per unit (g)
tailleM <- tailleVPH
# High-shedding period, ANSES opinion 2016-SA-0121:
meanCf <- 2.44
sdCf <- 1.98
PCf <- 0.039
m_souillures <- 10 # Original formula has mean 11: 1 + Poisson(10)
Se_spot <- 0.50
Se_sdiffuse <- 0.80

# All types share the SAME upstream contamination distribution.
# Type labels and counts are added for later mixing, not part of VPH3.
# Counts chosen for the 60/30/10 scenario of Figure 12.
n_fat <- 30000L
n_lean <- 15000L
n_frozen <- 5000L
stopifnot(n_fat + n_lean + n_frozen == runs)

rtriangle = function(n, a, b,c)
{
  u=runif(n)
  y=(u<(c-a)/(b-a))
  x=y*(a+sqrt(u*(b-a)*(c-a)))+(1-y)*(b-sqrt((1-u)*(b-a)*(b-c)))
  return(x)
} 
rloglogistic = function(n, beta, alpha = 1)
{
  p = runif(n)
  return (beta* (((1-p)/p)^(-1/alpha)))
}

#fonction pour déterminer le nombre morceau par mêlée
rNotrm=function(mcombo)
{
  w =0
  m=c()
  repeat{
    mtrm=rtriangle(1,50,1000,500)#masse des morceaux de viande en g 
    w=w+mtrm
    m=c(m,mtrm)
    if (w>=mcombo){
      break
    }
  }
  return(m)
}


  Pf=PCf
  animals=n
  mcombo=tailleM
  Notrm=length(rNotrm(mcombo))
  Notrm
  TRfh=rlnorm(runs,3.193,0.106)#taux de tranfert MF vers le cuir 
  Ph =Pf*TRfh/(1-Pf+TRfh*Pf) # équation 1
  TRhc=rnorm(runs,0.237,0.009)# taux de tranfert de cuir vers surface carcasse
  Pc=TRhc*Ph /(1-Ph +TRhc*Ph)# équation 3
  
  Ex=runif(runs,0.001,0.01)# probabilité de rupture des viscères
  Pv=Pf       # prevalence contamination par v
  Pcv=Pv*Ex-(Pc*Pv*Ex) # uniquement visecères
  Pcc=Pc-(Pc*Pv*Ex)    # uniquement par les cuirs
  Pccv=Pc*Pv*Ex       # cuir et viscères
  
  Pct=Pcv+Pcc+Pccv # pourcentage de carcasses contaminées par lot
  
  ContC=rbinom(runs,animals,Pct)# nombre de carcasses contaminées
  
  
  
  ####
  
  
  num_VPH=rep(1:runs,ContC)#une ligne par carcasse
  nr=length(num_VPH)
  Cf=rnorm(nr,meanCf,sdCf)# concentration féces pour les  carcasses contaminées
  TFfh=-3.77+rloglogistic(nr,2.29,10.3)# fraction de bactéries tranférées vers cuir pour les  carcasses contaminées
  Ch=Cf+TFfh # concentration cuir équation 2
  Tfhc=rlogis(nr,-1.97,0.457) # fraction de bactéries tranférées vers carcasse pour les  carcasses 
  Cc=Ch+Tfhc-2 # passage de 100 à 1 cm2 équation 4
  spot=7 # surface moyenne d'un spot en cm2
  sdiffuse=150#ssurface moyenne d'une souillure diffuse en cm2
  n_souillures=1+rpois(nr,m_souillures)# 10 souillures en moyenne par carcasse
  n_Spot=rbinom(nr,0.8,size=n_souillures)
  
  a=spot*n_Spot+sdiffuse*(n_souillures-n_Spot)#surface totale contaminée en cm2
  
  n_sdiffuses_restants=rbinom(nr,prob=1-Se_sdiffuse,size=n_souillures-n_Spot)
  n_spots_restants=rbinom(nr,prob=1-Se_spot,size=n_Spot)
  a_c=n_spots_restants*spot+n_sdiffuses_restants*sdiffuse
  
  
  Oh=10^(Cc+log10(a_c))# nombre de bactéries provenant du cuir équation 5
  q=runif(nr,1,20)# quantité en g du contenu des viscères
  Ov=(10^(Cf))*q # nombre de bactéries provenant des viscères équation 5
  Ocv=Oh+Ov # équation 5
  
  Pcc_total=rep(Pcc,ContC)#s'assurer que les animaux d'un même lots ont le mêm Pcc
  Pct_total=rep(Pct,ContC)
  Pcv_total=rep(Pcv,ContC)
  Pccv_total=rep(Pccv,ContC)
  probs=cbind(Pcc_total/Pct_total,
              Pcv_total/Pct_total,
              Pccv_total/Pct_total)
  
  Otrmc=rMultinom(probs, 1)#TAS multinomiale pour les  carcasses contaminées pour c,v et cv 
  
  Nph=ifelse(Otrmc==1,Oh,0)  
  Npv=ifelse(Otrmc==2,Ov,0)      
  Nphv=ifelse(Otrmc==3,Ocv,0)                     
  Ntot=Nph+Npv+Nphv #N total de bactéries par carcasse
  
  Fbgb=runif(nr,0.75,0.9)#fraction de bactéries qui va se trouver dans les morceaux de viande destinés à fabriquer de la VH
  Ntot=Ntot*Fbgb 
  
  trm=rpois(nr,Notrm/animals)#nombre de morceau par carcasse
  Num_trm=rep(1:nr,trm)
  Ntrm=rep(Ntot,trm)# affecter la même Ntot pour les morceaux d'une même carcasse
  
  mtrm=rtriangle(length(Num_trm),50,1000,500)# masse des morceaux
  SAtrm=runif(length(Num_trm),0.1,0.5)#proportion surface par rapport à la masse
  TSA=32000
  Ntrm=Ntrm*SAtrm*mtrm/TSA # nombre attendu de bactéries par morceau 
  sortie_VPH=tibble(VPH=rep(num_VPH,trm),animal=Num_trm,masse=mtrm,cfu=Ntrm)
  
  total_lot=sortie_VPH%>%
    group_by(VPH)%>%
    summarise(cfu=sum(cfu),masse=round(sum(masse),0))

# Include every simulated unit, also those absent from total_lot.
# total_lot$masse describes represented contaminated carcass contributions,
# NOT the full unit mass. Use tailleVPH for the latter.
all_units <- tibble(VPH = seq_len(runs)) %>%
  left_join(total_lot %>% select(VPH, cfu), by = "VPH") %>%
  mutate(cfu = coalesce(cfu, 0))

vph_contamination <- tibble(
  vph_id = c(sprintf("G%05d", seq_len(n_fat)),
             sprintf("M%05d", seq_len(n_lean)),
             sprintf("C%05d", seq_len(n_frozen))),
  type = rep(c("fat", "lean", "frozen"),
             times = c(n_fat, n_lean, n_frozen)),
  mass_g = rep(tailleVPH, runs),
  expected_cfu = all_units$cfu
)
vph_contamination <- vph_contamination %>%
  mutate(
    cfu = rpois(n(), lambda = expected_cfu)
  )

write.csv(
  vph_contamination,
  "vph_contamination.csv",
  row.names = FALSE
)
stopifnot(nrow(vph_contamination) == runs,
          !anyDuplicated(vph_contamination$vph_id),
          all(is.finite(vph_contamination$expected_cfu)),
          all(vph_contamination$expected_cfu >= 0))

# Expected bacterial numbers remain decimal values, as in VPH3.
# Output location: current working directory (getwd()).
write.csv(vph_contamination, "vph_contamination.csv", row.names = FALSE)
message("Created: ", normalizePath("vph_contamination.csv"))
message("Units: ", runs, "; zero-contamination units: ",
        sum(vph_contamination$expected_cfu == 0))
