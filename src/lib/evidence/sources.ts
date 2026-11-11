/**
 * Research sources cited by the coaching rules.
 *
 * Every entry must link to the paper (`url`). Add a source here first, then
 * reference its key from a rule in ./rules. See docs/research/ADDING_RESEARCH.md.
 *
 * `finding` states only what the source itself reports. If a rule goes further
 * than the source, say so in the rule's `caveat`, not here.
 */

import type { EvidenceSource } from "@/types";

export const SOURCES = {
  acsm2026: {
    short: "ACSM 2026",
    authors: "American College of Sports Medicine",
    year: 2026,
    title:
      "American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews",
    journal: "Medicine & Science in Sports & Exercise",
    design: "position-stand",
    population: "137 systematic reviews, more than 30,000 adults",
    finding:
      "Strength gains were higher with loads of 80% of 1RM or more, 2–3 sets, lifting early in the session and at least 2 sessions a week. Training to failure did not consistently change outcomes.",
    url: "https://pubmed.ncbi.nlm.nih.gov/41843416/",
    pmid: "41843416",
  },
  robinson2024: {
    short: "Robinson 2024",
    authors: "Robinson et al.",
    year: 2024,
    title:
      "Exploring the Dose–Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions",
    journal: "Sports Medicine",
    design: "meta-analysis",
    population: "Meta-regressions of resistance training studies",
    finding:
      "Strength gains were similar whether sets stopped far from failure or close to it. Muscle growth increased as sets ended closer to failure.",
    url: "https://doi.org/10.1007/s40279-024-02069-2",
    doi: "10.1007/s40279-024-02069-2",
  },
  pelland2026: {
    short: "Pelland 2026",
    authors: "Pelland et al.",
    year: 2026,
    title:
      "The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains",
    journal: "Sports Medicine",
    design: "meta-analysis",
    population: "67 studies, 2,058 participants",
    finding:
      "More weekly sets produced more muscle growth with diminishing returns. Strength gains levelled off much sooner and responded to training frequency. Sets that train a muscle indirectly were counted as half a set.",
    url: "https://doi.org/10.1007/s40279-025-02344-w",
    doi: "10.1007/s40279-025-02344-w",
  },
  singer2024: {
    short: "Singer 2024",
    authors: "Singer et al.",
    year: 2024,
    title:
      "Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy",
    journal: "Frontiers in Sports and Active Living",
    design: "meta-analysis",
    population: "9 studies",
    finding:
      "Resting longer than 60 seconds between sets gave a small muscle-growth benefit. No further benefit was detectable beyond 90 seconds.",
    url: "https://doi.org/10.3389/fspor.2024.1429789",
    doi: "10.3389/fspor.2024.1429789",
    fullTextUrl:
      "https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full",
  },
  grgic2018: {
    short: "Grgic 2018",
    authors: "Grgic et al.",
    year: 2018,
    title:
      "Effects of Rest Interval Duration in Resistance Training on Measures of Muscular Strength: A Systematic Review",
    journal: "Sports Medicine",
    design: "systematic-review",
    population: "23 studies, 491 participants",
    finding:
      "Rest intervals longer than 2 minutes appear to be needed to maximise strength gains in trained lifters. 60–120 seconds seems enough for untrained lifters.",
    url: "https://doi.org/10.1007/s40279-017-0788-x",
    doi: "10.1007/s40279-017-0788-x",
    pmid: "28933024",
  },
  moranNavarro2017: {
    short: "Morán-Navarro 2017",
    authors: "Morán-Navarro et al.",
    year: 2017,
    title:
      "Time course of recovery following resistance training leading or not to failure",
    journal: "European Journal of Applied Physiology",
    design: "trial",
    population: "10 resistance-trained men",
    finding:
      "Sets taken to failure slowed recovery by 24–48 hours compared with work stopped short of failure.",
    url: "https://doi.org/10.1007/s00421-017-3725-7",
    doi: "10.1007/s00421-017-3725-7",
    pmid: "28965198",
  },
  halperin2022: {
    short: "Halperin 2022",
    authors: "Halperin et al.",
    year: 2022,
    title:
      "Accuracy in Predicting Repetitions to Task Failure in Resistance Exercise: A Scoping Review and Exploratory Meta-analysis",
    journal: "Sports Medicine",
    design: "meta-analysis",
    population: "12 studies, 414 participants",
    finding:
      "People underestimated the reps they had left by about one. Estimates were more accurate close to failure, in sets of 12 reps or fewer, and in later sets.",
    url: "https://pubmed.ncbi.nlm.nih.gov/34542869/",
    pmid: "34542869",
  },
  zhang2021: {
    short: "Zhang 2021",
    authors: "Zhang et al.",
    year: 2021,
    title:
      "Auto-Regulation Method vs. Fixed-Loading Method in Maximum Strength Training for Athletes: A Systematic Review and Meta-Analysis",
    journal: "Frontiers in Physiology",
    design: "meta-analysis",
    population: "8 studies, 166 athletes",
    finding:
      "Adjusting the load to how the session is going produced larger maximal-strength gains than fixed, pre-planned loads.",
    url: "https://doi.org/10.3389/fphys.2021.651112",
    doi: "10.3389/fphys.2021.651112",
    fullTextUrl: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7994759/",
  },
  nuzzo2024: {
    short: "Nuzzo 2024",
    authors: "Nuzzo et al.",
    year: 2024,
    title:
      "Maximal Number of Repetitions at Percentages of the One Repetition Maximum: A Meta-Regression and Moderator Analysis of Sex, Age, Training Status, and Exercise",
    journal: "Sports Medicine",
    design: "meta-analysis",
    population: "269 studies, 7,289 people",
    finding:
      "The number of reps possible at a given percentage of 1RM differs between exercises and between people, so any single formula is an approximation.",
    url: "https://doi.org/10.1007/s40279-023-01937-7",
    doi: "10.1007/s40279-023-01937-7",
    fullTextUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10933212",
  },
  spiering2021: {
    short: "Spiering 2021",
    authors: "Spiering et al.",
    year: 2021,
    title:
      "Maintaining Physical Performance: The Minimal Dose of Exercise Needed to Preserve Endurance and Strength Over Time",
    journal: "Journal of Strength and Conditioning Research",
    design: "review",
    population: "Narrative review",
    finding:
      "Strength can be maintained for up to 32 weeks with as little as one session a week and one set per exercise, as long as the load stays heavy.",
    url: "https://pubmed.ncbi.nlm.nih.gov/33629972/",
    pmid: "33629972",
  },
  halonen2024: {
    short: "Halonen 2024",
    authors: "Halonen et al.",
    year: 2024,
    title:
      "Does Taking a Break Matter—Adaptations in Muscle Strength and Size Between Continuous and Periodic Resistance Training",
    journal: "Scandinavian Journal of Medicine & Science in Sports",
    design: "rct",
    population: "55 untrained adults",
    finding:
      "After a 10-week break, strength and muscle size were back to pre-break levels within about 5 weeks of retraining. Strength was better preserved than size.",
    url: "https://pubmed.ncbi.nlm.nih.gov/39364857/",
    pmid: "39364857",
  },
  bosquet2013: {
    short: "Bosquet 2013",
    authors: "Bosquet et al.",
    year: 2013,
    title:
      "Effect of training cessation on muscular performance: A meta-analysis",
    journal: "Scandinavian Journal of Medicine & Science in Sports",
    design: "meta-analysis",
    population: "103 studies",
    finding:
      "Strength declines when training stops, and the loss grows with the length of the break.",
    url: "https://doi.org/10.1111/sms.12047",
    doi: "10.1111/sms.12047",
    pmid: "23347054",
  },
  robineau2016: {
    short: "Robineau 2016",
    authors: "Robineau et al.",
    year: 2016,
    title:
      "Specific Training Effects of Concurrent Aerobic and Strength Exercises Depend on Recovery Duration",
    journal: "Journal of Strength and Conditioning Research",
    design: "trial",
    population: "58 amateur rugby players, 7 weeks",
    finding:
      "Strength gains were smaller when strength and aerobic sessions were done back to back, but not when they were 6 or 24 hours apart.",
    url: "https://pubmed.ncbi.nlm.nih.gov/25546450/",
    pmid: "25546450",
  },
  markov2021: {
    short: "Markov 2021",
    authors: "Markov et al.",
    year: 2021,
    title:
      "Acute Effects of Aerobic Exercise on Muscle Strength and Power in Trained Male Individuals: A Systematic Review with Meta-analysis",
    journal: "Sports Medicine",
    design: "meta-analysis",
    population: "15 studies in trained men",
    finding:
      "Aerobic exercise reduced strength immediately afterwards, more after sessions longer than 30 minutes or at higher intensity, and less after running than cycling.",
    url: "https://doi.org/10.1007/s40279-021-01615-6",
    doi: "10.1007/s40279-021-01615-6",
    fullTextUrl: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9124655/",
  },
  schumann2022: {
    short: "Schumann 2022",
    authors: "Schumann et al.",
    year: 2022,
    title:
      "Compatibility of Concurrent Aerobic and Strength Training for Skeletal Muscle Size and Function: An Updated Systematic Review and Meta-Analysis",
    journal: "Sports Medicine",
    design: "meta-analysis",
    population: "Systematic review and meta-analysis",
    finding:
      "Combining aerobic and strength training did not compromise muscle growth or maximal strength.",
    url: "https://doi.org/10.1007/s40279-021-01587-7",
    doi: "10.1007/s40279-021-01587-7",
  },
  roth2022: {
    short: "Roth 2022",
    authors: "Roth et al.",
    year: 2022,
    title:
      "Lean mass sparing in resistance-trained athletes during caloric restriction: the role of resistance training volume",
    journal: "European Journal of Applied Physiology",
    design: "systematic-review",
    population: "15 studies in resistance-trained athletes",
    finding:
      "Programs with 10 or more weekly sets per muscle group showed little or no lean-mass loss during a calorie deficit, though the evidence is not conclusive.",
    url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9012799/",
    pmid: "35146569",
  },
  murphyKoehler2022: {
    short: "Murphy & Koehler 2022",
    authors: "Murphy & Koehler",
    year: 2022,
    title:
      "Energy deficiency impairs resistance training gains in lean mass but not strength: A meta-analysis and meta-regression",
    journal: "Scandinavian Journal of Medicine & Science in Sports",
    design: "meta-analysis",
    population: "Mostly untrained participants",
    finding:
      "Training in a calorie deficit impaired lean-mass gains but not strength gains.",
    url: "https://doi.org/10.1111/sms.14075",
    doi: "10.1111/sms.14075",
  },
  saeterbakken2011: {
    short: "Saeterbakken 2011",
    authors: "Saeterbakken et al.",
    year: 2011,
    title:
      "A comparison of muscle activity and 1-RM strength of three chest-press exercises with different stability requirements",
    journal: "Journal of Sports Sciences",
    design: "trial",
    population: "Trained lifters, three bench-press variations",
    finding:
      "Dumbbell bench press 1RM was about 17% lower than barbell bench press 1RM.",
    url: "https://pubmed.ncbi.nlm.nih.gov/21225489/",
    pmid: "21225489",
  },
  smith2017: {
    short: "Smith 2017",
    authors: "Smith et al.",
    year: 2017,
    title:
      "Should exercises be painful in the management of chronic musculoskeletal pain? A systematic review and meta-analysis",
    journal: "British Journal of Sports Medicine",
    design: "meta-analysis",
    population: "7 trials, 385 people with chronic musculoskeletal pain",
    finding:
      "Exercise programs that allowed some pain gave a small short-term benefit over pain-free exercise, with no difference in the medium or long term.",
    url: "https://eprints.nottingham.ac.uk/41764",
  },
  craven2022: {
    short: "Craven 2022",
    authors: "Craven et al.",
    year: 2022,
    title:
      "Effects of Acute Sleep Loss on Physical Performance: A Systematic and Meta-Analytical Review",
    journal: "Sports Medicine",
    design: "meta-analysis",
    population: "69 publications",
    finding:
      "A night of lost or restricted sleep lowered physical performance by about 7.6% on average.",
    url: "https://doi.org/10.1007/s40279-022-01706-y",
    doi: "10.1007/s40279-022-01706-y",
    pmid: "35708888",
  },
  stults2014: {
    short: "Stults-Kolehmainen 2014",
    authors: "Stults-Kolehmainen et al.",
    year: 2014,
    title:
      "Chronic psychological stress impairs recovery of muscular function and somatic sensations over a 96-hour period",
    journal: "Journal of Strength and Conditioning Research",
    design: "trial",
    population: "31 resistance-training students",
    finding:
      "Lifters under higher life stress recovered strength more slowly over the 96 hours after a hard session.",
    url: "https://pubmed.ncbi.nlm.nih.gov/24343323/",
    pmid: "24343323",
  },
  helms2014: {
    short: "Helms 2014",
    authors: "Helms et al.",
    year: 2014,
    title:
      "Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation",
    journal: "Journal of the International Society of Sports Nutrition",
    design: "review",
    population: "Review for physique athletes",
    finding:
      "Losing 0.5–1% of bodyweight per week is recommended to retain muscle while dieting.",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492",
    doi: "10.1186/1550-2783-11-20",
    pmid: "24864135",
  },
  peos2021: {
    short: "Peos 2021",
    authors: "Peos et al.",
    year: 2021,
    title:
      "Continuous versus Intermittent Dieting for Fat Loss and Fat-Free Mass Retention in Resistance-trained Adults: The ICECAP Trial",
    journal: "Medicine & Science in Sports & Exercise",
    design: "rct",
    population: "61 resistance-trained adults, 12 weeks",
    finding:
      "Week-long diet breaks did not improve fat loss or lean-mass retention compared with continuous dieting.",
    url: "https://pubmed.ncbi.nlm.nih.gov/33587549/",
    pmid: "33587549",
  },
  coleman2024: {
    short: "Coleman 2024",
    authors: "Coleman et al.",
    year: 2024,
    title:
      "Gaining more from doing less? The effects of a one-week deload period during supervised resistance training on muscular adaptations",
    journal: "PeerJ",
    design: "rct",
    population: "39 trained adults, 9 weeks",
    finding:
      "A week off training at the midpoint did not improve muscle growth and led to smaller strength gains than training straight through.",
    url: "https://peerj.com/articles/16777",
    doi: "10.7717/peerj.16777",
    pmid: "38274324",
  },
  pancar2026: {
    short: "Pancar 2026",
    authors: "Pancar et al.",
    year: 2026,
    title:
      "Effects of deload periods in resistance training on muscle hypertrophy and strength endurance in untrained young men using a randomized within subject design",
    journal: "Scientific Reports",
    design: "trial",
    population: "19 untrained young men, 8 weeks",
    finding:
      "Limbs given reduced-volume deload weeks gained as much muscle and strength-endurance as limbs trained continuously.",
    url: "https://www.nature.com/articles/s41598-026-40612-5",
    doi: "10.1038/s41598-026-40612-5",
  },
} as const satisfies Record<string, EvidenceSource>;

export type SourceId = keyof typeof SOURCES;
