# Agent Interaction Script — Zava Industries Full Workshop

This document provides the exact inputs an automated agent should supply to sofIA during each phase of the AI Discovery Workshop. The agent plays the role of **Marco Bellini, Head of Innovation at Zava Industries**.

> **Usage:** Feed each numbered response to sofIA when it asks the corresponding question. Wait for sofIA's prompt before supplying the next input. When sofIA presents options, choose the option indicated. When sofIA asks for confirmation, respond with the indicated confirmation text.

---

## Phase 1: Discover

### Step 1 — Understand the Business

**Agent Input 1 (initial business description):**

> We are Zava Industries, a mid-premium fashion company based in Milan. We design and sell modern clothing for ages 20–55. Our competitive edge is trend analysis — we try to detect emerging fashion trends before competitors and turn them into collections fast. We have a team of 20: 5 designers, 4 trend analysts, 3 data scientists, 2 developers, 3 marketing people, 2 ops people, and me as Head of Innovation.
>
> Our biggest challenge is speed. Right now our trend analysts spend about 60% of their time manually gathering data from Instagram, TikTok, Pinterest, celebrity magazines, films, and runway shows. This data ends up scattered across Google Sheets, Miro boards, Notion pages, and email threads. By the time we consolidate everything into a trend report, fast-fashion competitors like Zara and Shein have already reacted.
>
> We do about €18M annual revenue, serve the EU primarily but are expanding to the US. Our trend-to-retail cycle is 10–14 weeks and we want to get it under 8. We're an Azure shop — Azure SQL, Blob Storage, Power BI for sales dashboards.

**Agent Input 2 (responding to follow-up probes about team/process):**

> The trend analysts each specialize: Sara covers social media (Instagram, TikTok), Dimitri tracks runway and trade shows, Aisha monitors celebrity and entertainment media, and Tomás does competitor retail analysis. They each produce about 3 reports per month. The data scientists — Priya, Liam, and Mei — have built a basic demand forecasting model using Power BI and Azure ML, but it only works on historical sales data, not on forward-looking trend signals.
>
> Our designers get a consolidated trend brief every 2–3 weeks, which they say is too slow. They want real-time or near-real-time signals. The hit rate for our collections is about 35% — only 35% of designed pieces make it to production. We believe better trend data could push that to 50% or more.
>
> Key metrics we track: trend detection lead time (currently ~4 weeks, want <1 week), collection hit rate (35%, want 50%+), time to market (10–14 weeks, want 8), and analyst productivity (3 reports/month, want 8+).

### Step 2 — Choose a Topic

**Agent Input 3 (selecting topic):**

> I'd like to focus on **Trend Intelligence and Signal Aggregation** — specifically, how we can use AI to automate the gathering and scoring of trend signals from multiple sources (social media, celebrity media, runway, retail). This is the bottleneck that affects everything else downstream: design speed, collection accuracy, and market responsiveness.

### Step 3 — Ideate Activities

**Agent Input 4 (describing current activities):**

> Here are the key activities in our trend analysis workflow:
>
> 1. **Social Media Scanning** — Analysts browse Instagram, TikTok, Pinterest for emerging styles, colors, silhouettes. Mostly manual with some Brandwatch alerts.
> 2. **Celebrity & Entertainment Monitoring** — Weekly scan of Vogue, Elle, People, Hola! plus streaming shows. Screenshots go to Miro.
> 3. **Runway & Trade Show Tracking** — Attend or watch livestreams of 4–6 shows/year. Notes in Notion.
> 4. **Competitor Retail Analysis** — Manual store visits and online browsing of Zara, H&M, COS, etc.
> 5. **Signal Consolidation** — Merge all data into a trend report. This takes 1–2 weeks.
> 6. **Trend Scoring & Prioritization** — Team meeting to rank trends. Very subjective, no consistent framework.
> 7. **Design Brief Creation** — Create briefs for designers based on top trends.
> 8. **Designer Feedback Loop** — Designers review briefs, ask questions, iterate.
>
> What we'd do if it weren't so hard: real-time multi-source signal aggregation, automated trend scoring with a confidence index, instant visual mood board generation, and predictive trend lifecycle estimation (is this trend rising, peaking, or fading?).

### Step 4 — Map Workflow

**Agent Input 5 (voting on critical steps):**

> The most critical steps are:
>
> - **Social Media Scanning** — Business value: 5, Human value: 4 (it's mind-numbing repetitive work). Key metric: hours/week spent scanning (~25hrs across the team).
> - **Signal Consolidation** — Business value: 5, Human value: 3. Key metric: time to produce a consolidated report (currently 1–2 weeks).
> - **Trend Scoring & Prioritization** — Business value: 5, Human value: 4 (analysts feel frustrated by the subjectivity). Key metric: consistency of scoring across analysts (currently not measured).
> - **Design Brief Creation** — Business value: 4, Human value: 3. Key metric: designer satisfaction with brief quality (NSAT ~3.2/5).

**Agent Input 6 (confirming workflow summary):**

> Yes, that workflow summary looks accurate. Let's proceed to ideation.

---

## Phase 2: Ideate

### Step 5 — Explore AI Envisioning Cards

**Agent Input 7 (reacting to cards):**

> I'm very interested in these cards:
>
> - **Computer Vision / Image Recognition** — for automatically analyzing social media images and runway photos
> - **Natural Language Processing** — for extracting trend signals from captions, comments, articles
> - **Recommendation Systems** — for suggesting which trends are most relevant to our brand DNA
> - **Anomaly / Pattern Detection** — for spotting emerging patterns before they go mainstream
> - **Predictive Analytics** — for forecasting trend lifecycle and commercial potential
> - **Content Generation** — for auto-generating mood boards and visual summaries
> - **Data Integration / Aggregation** — for unifying our scattered data sources
> - **Sentiment Analysis** — for gauging public reaction to trends and celebrity outfits

### Step 6 — Score Cards

**Agent Input 8 (scoring cards):**

> Here are my scores (Relevance / Feasibility / Impact):
>
> | Card                                | Relevance | Feasibility | Impact |
> | ----------------------------------- | --------- | ----------- | ------ |
> | Computer Vision / Image Recognition | 5         | 3           | 5      |
> | Natural Language Processing         | 5         | 4           | 4      |
> | Recommendation Systems              | 4         | 3           | 4      |
> | Anomaly / Pattern Detection         | 5         | 3           | 5      |
> | Predictive Analytics                | 5         | 2           | 5      |
> | Content Generation                  | 3         | 4           | 3      |
> | Data Integration / Aggregation      | 5         | 5           | 4      |
> | Sentiment Analysis                  | 4         | 4           | 4      |

### Step 7 — Review Top Cards

**Agent Input 9 (confirming top cards):**

> I agree with the top cards selection. Let's aggregate "Computer Vision" and "Anomaly/Pattern Detection" under a theme of **"Visual Trend Detection"**, and "NLP" and "Sentiment Analysis" under **"Text-Based Trend Intelligence"**. The rest can stay as individual cards.

### Step 8 — Map Cards to Workflow

**Agent Input 10 (mapping cards to workflow):**

> Here's how I see the mapping:
>
> - **Visual Trend Detection** → Social Media Scanning, Celebrity Monitoring, Runway Tracking
> - **Text-Based Trend Intelligence** → Social Media Scanning, Celebrity Monitoring
> - **Data Integration / Aggregation** → Signal Consolidation
> - **Recommendation Systems** → Trend Scoring & Prioritization
> - **Predictive Analytics** → Trend Scoring & Prioritization, Design Brief Creation
> - **Content Generation** → Design Brief Creation, Designer Feedback Loop

### Step 9 — Generate Ideas

**Agent Input 11 (responding to ideation prompts):**

> I love the "How Might We" framing. Here are my thoughts on the generated ideas:
>
> 1. **TrendLens** — an AI visual analyzer that processes social media and celebrity photos in near-real-time, extracting fashion attributes (colors, silhouettes, patterns, fabrics) and tracking their frequency over time. This is our top priority.
> 2. **TrendPulse Dashboard** — a unified real-time dashboard that aggregates all trend signals (visual + text + retail) into a single view with trend scores and lifecycle indicators.
> 3. **AutoBrief Generator** — AI that creates design briefs automatically from detected trends, including visual mood boards, color palettes, and reference images.
> 4. **Celebrity Impact Tracker** — AI that correlates celebrity outfit appearances with social media engagement spikes and retail demand signals.
> 5. **Trend Predictor** — a predictive model that estimates trend lifecycle (emerging, peaking, declining) and commercial potential based on historical pattern matching.
>
> I'm most excited about ideas 1 and 2 — they address our core bottleneck.

**Agent Input 12 (confirming idea cards):**

> These idea cards look great. Let's move to the Design phase.

---

## Phase 3: Design

### Steps 10–12

**Agent Input 13 (refining idea cards):**

> For TrendLens, I want to add:
>
> - **Assumptions:** We assume we can get sufficient social media API access (Instagram Graph API, TikTok Research API). We assume Azure Cognitive Services has sufficient fashion-domain accuracy or can be fine-tuned.
> - **Data Needed:** Social media images (public posts), celebrity photo feeds, runway show images. At least 6 months historical to train pattern recognition.
>
> For TrendPulse Dashboard, add:
>
> - **Assumptions:** Our existing Power BI infrastructure can be extended or replaced. The team will adopt a new tool if it's significantly better.
> - **Data Needed:** All source feeds plus our historical sales data for correlation.

**Agent Input 14 (scoring feasibility/value):**

> My scores:
>
> | Idea                     | Feasibility (1-5) | Business Value (1-5) |
> | ------------------------ | ----------------- | -------------------- |
> | TrendLens                | 3                 | 5                    |
> | TrendPulse Dashboard     | 4                 | 5                    |
> | AutoBrief Generator      | 4                 | 3                    |
> | Celebrity Impact Tracker | 3                 | 4                    |
> | Trend Predictor          | 2                 | 5                    |

**Agent Input 15 (impact assessment feedback):**

> I agree with the BXT assessment. A few additions:
>
> - **Risk for TrendLens:** Social media API rate limits and policy changes are a real threat. We need to design for provider-agnostic data ingestion.
> - **Risk for TrendPulse:** Change management — analysts are attached to their individual tools. We need a great UX.
> - **Biggest opportunity:** If we combine TrendLens + TrendPulse into one platform, it becomes a potential SaaS product we could sell to other fashion brands.

**Agent Input 16 (confirming design output):**

> The architecture sketch and impact assessment look solid. Let's proceed to Selection.

---

## Phase 4: Select

**Agent Input 17 (responding to recommendation):**

> I agree with the recommendation. Let me confirm: I want to proceed with **TrendPulse Dashboard with integrated TrendLens** — the unified real-time trend intelligence platform that combines visual AI analysis with multi-source signal aggregation. This addresses our core bottleneck (manual data gathering and slow consolidation) and has the best combined feasibility + impact score. It also has long-term potential as a SaaS product.

---

## Phase 5: Plan

**Agent Input 18 (plan refinement):**

> The milestones look good. A few notes:
>
> - For the PoC, I want the minimum viable scope to be: ingest images from one social media source (Instagram), extract basic fashion attributes (colors, patterns), and display them on a simple dashboard with a trend frequency chart.
> - **Tech stack preference:** Azure Functions for the backend, Azure Cognitive Services (Custom Vision or Azure AI Vision) for image analysis, Azure Cosmos DB for trend signal storage, and a simple React or Next.js frontend.
> - **PoC timeline:** 4 weeks with the two developers (Javier, Nadia) and one data scientist (Priya).
> - **Success criteria for PoC:** Process at least 100 images, extract 3+ fashion attributes per image with >70% accuracy, display trend frequency on the dashboard updating at least hourly.

**Agent Input 19 (confirming plan):**

> The plan and PoC definition look great. I'm ready to proceed to the Develop phase.

---

## Phase 6: Develop (Boundary — workshop side)

**Agent Input 20 (PoC intent capture):**

> For the PoC development:
>
> - **Target stack:** TypeScript + Node.js for the backend API, React for the dashboard, Azure Cognitive Services for image analysis.
> - **Key scenarios:** (1) Ingest an Instagram-like image feed, (2) extract fashion attributes using AI vision, (3) aggregate signals into trend scores, (4) display on a real-time dashboard.
> - **Constraints:** Must run locally for the PoC (no production Azure deployment needed yet). Should use mocked image data if API access is unavailable.
> - **Out of scope for PoC:** User authentication, multi-language support, production scaling.

---

## Decision Gate Responses

At each phase transition, when sofIA asks for a decision:

- **After Discover:** "Continue to next phase"
- **After Ideate:** "Continue to next phase"
- **After Design:** "Continue to next phase"
- **After Select:** "Continue to next phase"
- **After Plan:** "Continue to next phase" (or "Automatically start development" if offered)

If sofIA asks "Would you like me to search the web for information about your company?", respond:

> Yes, please research Zava Industries and the fashion trend analysis technology landscape.

If sofIA asks about WorkIQ access, respond:

> No, we don't have WorkIQ configured for this session. Skip it.

---

## Abort / Error Handling Inputs

If sofIA encounters an error and offers retry:

> Retry

If sofIA asks to refine the current phase:

> The current output looks good. Let's continue to the next phase.

If sofIA shows an unrecoverable error:

> Log the error and note it in the assessment results. Attempt to continue from the last known good state.

---

_This script is designed for automated testing of the sofIA CLI. All inputs are consistent with the Zava Industries company profile._
