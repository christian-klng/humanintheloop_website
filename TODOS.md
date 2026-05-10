# TODOs

## Evaluation Comparison UI
**What:** Build a comparison view where users can see how different LLM models scored on the same criteria and test case — side-by-side scores per criterion.
**Why:** The `model` column on `test_cases` and `evaluations` tables was designed for this. The experiment pipeline generates evals per model, but there's no UI to compare them yet. This is the end goal of the eval system.
**Depends on:** Full experiment pipeline (auth + projects + experiment UI) must be working first.

## Real-time Evaluation Updates (SSE)
**What:** Replace polling with server-sent events so the evaluation result pushes to the client instantly instead of the client asking repeatedly.
**Why:** Polling works for 10–30s evaluations but wastes requests and adds latency. SSE becomes valuable if evaluation times grow or if real-time collaboration features are added.
**Depends on:** Experiment pipeline must be working. Nginx needs `proxy_buffering off` for the SSE route.
