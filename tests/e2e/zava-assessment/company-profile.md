# Zava Industries — Company Profile

## Company Overview

**Name:** Zava Industries  
**Industry:** Fashion & Apparel Design  
**Founded:** 2014  
**HQ:** Milan, Italy (with a satellite studio in Barcelona, Spain)  
**Annual Revenue:** ~€18M  
**Customer base:** B2C and B2B (wholesale to multi-brand retailers)

Zava Industries designs and sells modern clothing lines driven by trend analysis. The company's competitive edge is its ability to detect and act on emerging fashion trends faster than traditional apparel houses, compressing the concept-to-rack cycle to 8–12 weeks.

## Target Market

- **Age range:** 20–55
- **Segments:** Urban professionals (20–35), trend-conscious mid-career (35–45), premium casual (45–55)
- **Geographies:** EU (primary), UK, US East Coast (growing)
- **Price point:** Mid-to-premium (€60–€350 per garment)

## Team (20 people)

| Role                      | Count | Names (key contacts)             | Responsibilities                                             |
| ------------------------- | ----- | -------------------------------- | ------------------------------------------------------------ |
| Head of Innovation        | 1     | Marco Bellini (you)              | Strategy, AI initiatives, workshop facilitator               |
| Fashion Designers         | 5     | Lucia, Ahmed, Yuki, Carlos, Iris | Concept design, mood boards, collection direction            |
| Trend Analysts            | 4     | Sara, Dimitri, Aisha, Tomás      | Social media monitoring, celebrity tracking, runway analysis |
| Data Scientists           | 3     | Priya, Liam, Mei                 | Trend data modeling, NLP on social feeds, demand forecasting |
| Software Developers       | 2     | Javier, Nadia                    | Internal tools, website, data pipelines                      |
| Marketing & Brand         | 3     | Elena, Fabio, Chloë              | Campaigns, influencer partnerships, brand storytelling       |
| Operations & Supply Chain | 2     | Hans, Beatriz                    | Sourcing, production coordination, logistics                 |

## Current Trend Analysis Process

### Data Sources (collected manually + semi-automated)

1. **Social networks:** Instagram, TikTok, Pinterest — analysts manually browse and tag emerging styles, colors, and silhouettes. They use basic social listening tools (Brandwatch, Sprout Social) but extraction is mostly copy-paste.
2. **Films & TV:** The team watches new releases and streaming hits, noting costume design trends. A shared Google Sheet tracks "looks" with screenshots.
3. **Celebrity magazines & paparazzi feeds:** Physical and digital magazines (Vogue, Elle, People, Hola!) are scanned weekly. Key looks are clipped into a Miro board.
4. **Runway & trade shows:** Analysts attend 4–6 shows/year; others are watched via livestream. Notes go into Notion.
5. **Retail & competitor monitoring:** Manual store visits + online browsing of Zara, H&M, COS, Arket, Massimo Dutti, & Other Stories.

### Pain Points

- **Manual data collection is slow:** Analysts spend ~60% of their time gathering rather than analyzing. By the time a trend report is ready, fast-fashion competitors may have already reacted.
- **No unified data repository:** Trend signals are scattered across Google Sheets, Miro, Notion, Instagram saves, and email threads. Cross-referencing is painful.
- **Subjectivity in trend scoring:** Each analyst has their own mental model. There's no consistent framework for ranking which trends are worth pursuing.
- **Limited predictive capability:** The data scientists have built a basic demand-forecasting model for existing products, but they can't yet predict _which new trends_ will sell. Their models are starved for structured historical trend data.
- **Slow design feedback loop:** Designers wait 2–3 weeks for a consolidated trend report. They'd prefer real-time or near-real-time signals.
- **Celebrity influence tracking is unreliable:** Tracking which celebrity outfits drive consumer interest is entirely manual and often lagging.

### Tools Currently Used

| Tool                       | Purpose                            | Limitation                                   |
| -------------------------- | ---------------------------------- | -------------------------------------------- |
| Brandwatch                 | Social listening                   | Expensive; limited fashion-specific taxonomy |
| Miro                       | Visual collaboration / mood boards | Not structured data; can't query             |
| Notion                     | Knowledge base / trend notes       | Siloed by analyst                            |
| Google Sheets              | Tracking spreadsheets              | No API integration with design tools         |
| Adobe Illustrator / CLO 3D | Design                             | No trend data input                          |
| Power BI                   | Demand dashboards                  | Only works on sales data, not trend signals  |
| Slack / Teams              | Communication                      | Information gets lost in chat history        |

### Key Metrics

- **Trend detection lead time:** Currently ~4 weeks from signal to actionable brief. Target: <1 week.
- **Trend report accuracy:** Currently subjective; no systematic measurement. Target: 70%+ retrospective accuracy.
- **Collection hit rate:** 35% of designed pieces make it to production (rest are killed in review). Target: 50%+.
- **Time to market:** 10–14 weeks from trend brief to retail floor. Target: 8 weeks.
- **Analyst productivity:** Each analyst produces ~3 reports/month. Target: 8+ with AI assistance.

### Business Challenges

1. Fast-fashion giants (Zara, Shein) can react to trends in 2–3 weeks; Zava takes 10+.
2. Consolidating multi-source signals into a single "trend score" is an unsolved problem for the team.
3. Celebrity-driven trends spike and fade quickly — the team often misses the window.
4. Design team creativity is bottlenecked by slow information flow, not by lack of talent.
5. The company wants to expand into the US market but needs faster, data-driven trend response to compete.

### Strategic Goals (next 12 months)

- Build an **AI-powered trend intelligence platform** that aggregates signals from social media, celebrity feeds, runway shows, and retail data.
- Enable **real-time trend dashboards** for designers with visual and data summaries.
- Create a **predictive trend scoring model** that ranks emerging trends by commercial potential.
- Reduce trend-to-retail cycle time to **8 weeks**.
- Launch a "**Trend Radar**" feature for buyers and wholesale partners.

### Constraints

- Budget: €200K for AI/tech initiatives this fiscal year.
- Team: 2 developers and 3 data scientists must maintain current systems while building new ones.
- Data: Social media API access is a known limitation (rate limits, platform policy changes).
- Compliance: GDPR applies to any consumer data; celebrity image rights are a legal consideration.
- Infrastructure: Currently Azure-based (Azure SQL, Azure Blob, Power BI). Prefer to stay in Azure ecosystem.

---

_This profile is fictional and created for the purpose of testing the sofIA AI Discovery Workshop CLI._
