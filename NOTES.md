# Engineering Notes
Github Link - https://github.com/anu02m/find-my-scholarship-AI
### Most Interesting Experiment: Anti-Hallucination Deadline Verification
Most scholarship aggregators hallucinate application deadlines when dates are omitted from search snippets. We designed a strict grounding constraint across the Eligibility and Ranking agents: deadlines are extracted exclusively from raw page text fetched via Tavily Extract. If an exact deadline date is not explicitly present in the source text, the model is strictly constrained to return `"not found"`. Testing confirmed this completely eliminates hallucinated cut-off dates while accurately preserving verified dates in the UI.

### Biggest Technical Challenge: Rate Limits & Model Availability
Gemini's free tier enforces strict rate limits, and individual models can experience temporary demand spikes (HTTP 503) or version shifts (HTTP 404). We solved this with a three-tier resilience strategy:
1. **Batching**: The Eligibility Agent evaluates opportunities in small chunks of 3 rather than making 10 concurrent calls.
2. **Backoff Retries**: All API operations use exponential backoff that detects 429 and 503 errors, waiting 3+ seconds before retrying.
3. **Model Fallback**: The client transparently cascades across `gemini-3.5-flash`, `gemini-flash-latest`, and `gemini-3.8-flash`, preventing temporary spikes on any single model from failing the live user stream.
