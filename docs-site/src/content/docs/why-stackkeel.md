---
title: Why Stackkeel Exists
description: "The idea behind Stackkeel: AI coding agents inverted the old rule that less process is better. When coordination costs API calls instead of meetings, disciplined software process becomes the cheapest way to build. Based on the essay by Chris Henson."
---

For thirty years, the winning move in software was less process. Small teams beat big
ones. Lightweight beat heavyweight. Every methodology that added coordination steps
eventually lost to one that removed them, because process overhead is human
coordination cost, and human coordination cost dominates almost everything else.

AI coding agents quietly broke that rule.

## The cost structure flipped

When an analyst pass, an architecture review, a written design, and an independent QA
verdict each cost a meeting, you skipped most of them and shipped. When each one costs
an API call, skipping them stops being thrift and starts being negligence. The
practices we abandoned as too heavyweight, staged reviews, written handoffs, explicit
verification, are suddenly the economical choice. The price chart changed. Most of our
instincts have not caught up.

Stackkeel's author, Chris Henson, spent three decades as a CTO on the "less process"
side of that fight. Then an agent flagged a missing file during a routine bug fix,
something entirely outside the framing of the request. As he put it in the essay this
kit grew out of:

> The agent that flagged this wasn't writing code. It was running the first phase of a
> six-phase pipeline.

That observation became a workflow, the workflow became conventions, and the
conventions, refined across several real products, became this kit.

## What that means in practice

**Artifacts are the substrate.** Work logs, decision records, and design docs are not
overhead here. They are how stateless agents hand work to each other, and how a
project remembers anything at all. "Codified conventions are durable. Uncodified ones
aren't, because the agent has no working memory."

**Roles create pressure.** The same model prompted as an adversarial analyst finds
different problems than the same model prompted as an implementer. Stackkeel's
[six-phase pipeline](/workflow/) is role-shaped pressure applied on purpose: analyst,
architect, tech lead, implementer, QA, and a final shipped-versus-intent verdict.

**Enforcement beats intention.** Conventions that live in a prompt evaporate.
Conventions that live in git hooks, tripwire scripts, and CI hold no matter which
assistant, or which human, is typing. That is why the kit's gates are mechanical:
commit grammar, work-log-before-code, secrets scanning, audit coverage, brand scope.

**The bottleneck moved.** With execution cheap, framing is what fails. A bad
assumption in phase one cascades confidently through everything downstream. The
pipeline exists to catch bad framing early, while it is still cheap to fix.

## The kit is the essay, executable

Everything above ships in the repository as working machinery rather than advice:
the pipeline in `AGENTS.md` and the agent roster, the memory in `docs/`, the
enforcement in `scripts/` and CI, and the [lifecycle](/sync/) that keeps projects
and kit exchanging improvements. Stackkeel was built, reviewed, tested, and released
by the same workflow it contains.

Read the original essay:
["Claude Code Did Something I Didn't Expect: It Made Me Want More Software Process"](https://www.linkedin.com/pulse/claude-code-did-something-i-didnt-expect-made-me-want-chris-henson-kjepe/)
by Chris Henson.
