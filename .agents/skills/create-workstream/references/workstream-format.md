# Workstream Format Reference

## Output Template

```markdown
# Workstream: [Name]

## Vision
[2-4 sentences describing the end state and why it matters]

## Current State
[Brief description of where the codebase is today relative to this vision]

## Key Challenges
[Bullet list of the hardest parts or biggest unknowns]

## Milestones

### Milestone 1: [gameplan-name-kebab-case]
**Definition of Done**: ...
**Why this is a safe pause point**: ...
**Unlocks**: ...

### Milestone 2: [gameplan-name-kebab-case]
**Definition of Done**: ...
**Why this is a safe pause point**: ...
**Unlocks**: ...
**Open Questions** (if any): ...

## Dependency Graph
- Milestone 1 -> []
- Milestone 2 -> [1]
- Milestone 3 -> [1]
- Milestone 4 -> [2, 3]

## Open Questions
[Questions that apply to the workstream as a whole, not yet resolved]

## Decisions Made
[Key technical or product decisions made during planning, with rationale]
```

---

## Complete Example: Provisioning Agent Product

Below is a real-world workstream demonstrating all sections. Use this as a quality reference.

# Workstream: Provisioning Agent Product

## Vision

Build a product that allows users to autonomously provision access to third-party SaaS services. Users sign up, add a payment card on file, and use a CLI tool (or Claude Code) to trigger an AI agent that creates virtual cards, completes web signup flows, handles verification, and extracts credentials. The agent runs hosted on AWS, with credentials stored securely and retrievable by users.

## Current State

We have a working PoC (`fg-provisioning-agent`) that demonstrates:
- Virtual card creation via Stripe Issuing (test mode)
- Browser automation with Playwright
- Dynamic skill injection (vendor + tech skills)
- ARIA-based page perception
- Successful end-to-end flow with mock vendor
- Blocked on real vendors by email verification

The PoC passes card details to the LLM, which must change for production.

## Key Challenges

- **Secret handling**: Card details and credentials must never reach the LLM
- **Email verification**: Critical capability to unblock real vendor testing
- **Hosted execution**: Agent must run in AWS, triggered via API
- **Multi-tenancy**: Isolated user accounts, shared agent infrastructure
- **Credential management**: Secure storage with user retrieval
- **Vendor coverage**: Skills for ~20 vendors plus robust generic fallback
- **Recurring charges**: Subscriptions will charge the virtual card monthly; need to handle re-billing
- **Prompt quality control**: Use Braintrust for evals to measure and control prompt/skill quality across vendors
- **Behavioral composition**: Agent must decompose workflows into reusable primitives that adapt to user/vendor state

## Behavioral Architecture

The agent cannot treat "provision access to vendor X" as a monolithic workflow. User state varies: they may already have an account, existing credentials, or partial setup. The agent must decompose intentions into **composable behavioral primitives** that can be dynamically selected based on current state.

**Example: Supabase API Key**

| User State | Behavior Sequence |
|------------|-------------------|
| No account | signup → verify_email → navigate_to_api_keys → create_api_key → extract_key |
| Has account, no API key | login → navigate_to_api_keys → create_api_key → extract_key |
| Has account + API key | login → navigate_to_api_keys → extract_key |

The primitives (`signup`, `login`, `verify_email`, `navigate_to_api_keys`, `create_api_key`, `extract_key`) are reusable. The agent selects which sequence to execute based on:
1. **Known state**: What credentials/accounts do we already have for this user+vendor?
2. **Observed state**: What does the page tell us? (e.g., "Welcome back" vs "Create account")
3. **Goal**: What does the user actually need? (new API key vs retrieve existing)

**Implications**:
- **State tracking**: Must persist user+vendor state across sessions
- **Skill decomposition**: Skills should define primitives, not just end-to-end flows
- **Dynamic planning**: Agent reasons about which primitives to execute, not just "follow the skill"
- **Recovery**: If a primitive fails, agent can retry or try alternative path (e.g., "forgot password" flow)

## Why Virtual Card Intermediation

Users add their payment card to their account, but we don't charge vendors directly with it. Instead, we issue virtual cards under Flowglad's cardholder account.

| Benefit | How it works |
|---------|--------------|
| **Anonymization** | Vendor never sees user's real card |
| **Spending controls** | Set max spend per provisioning job |
| **Instant deactivation** | After one-time use, card can be deactivated |
| **Fraud protection** | If vendor is compromised, user's real card is never at risk |
| **Charge visibility** | Every charge flows through our system |
| **Dispute leverage** | We're the cardholder, we can dispute charges |

**Payment flow:**
1. User triggers provisioning with spending limit
2. We charge user's card on file for the limit amount
3. We issue virtual card with that spending limit
4. Agent uses virtual card to pay vendor
5. If vendor charges less than limit, we refund the difference
6. If provisioning fails entirely, we refund in full

## Milestones

### Milestone 1: secret-handling-architecture

**Definition of Done**:
- Secret reference pattern implemented: LLM sees `{{CARD_NUMBER}}`, `{{CARD_CVC}}`, `{{CARD_EXPIRY}}`
- Secret registry: tool layer registers secrets, resolves refs at execution time
- Browser tool accepts secret refs for `type` action
- Secrets never appear in LLM context, logs, or error messages
- Pattern extensible to other secrets (`{{VERIFICATION_CODE}}`, `{{PASSWORD}}`)
- Mock vendor test passes with new architecture

**Why this is a safe pause point**: Agent works locally with production-safe secret handling. Core security model is correct.

**Unlocks**: All downstream work can build on secure foundation.

---

### Milestone 2: cli-interface-design

**Definition of Done**:
- CLI command structure designed and documented (command hierarchy, naming conventions, flags)
- Output formatting standards defined (tables, JSON, progress indicators, error display)
- Interactive vs non-interactive mode behavior specified
- Configuration system designed (~/.fgconfig, environment variables, project-local config)
- Authentication flow designed (login, token storage, refresh)
- Skeleton implementation with core infrastructure

**Why this is a safe pause point**: CLI skeleton is in place with consistent patterns. Future milestones implement commands against this foundation.

**Unlocks**: Consistent CLI UX across all features. M6, M7 implement against this design.

---

### Milestone 3: email-verification

**Definition of Done**:
- `EmailResolver` interface defined (provider-agnostic)
- One provider implementation (evaluate AgentMail, Mailgun, others)
- Generate unique email address per provisioning session
- Wait for email with configurable timeout
- Extract verification code or link from email body
- Agent tool: `waitForEmail` returns `{{VERIFICATION_CODE}}` or `{{VERIFICATION_LINK}}`
- Successfully provision from a real vendor requiring email verification

**Why this is a safe pause point**: Agent handles email-verified signups. Major capability unlock.

**Unlocks**: Testing with majority of real-world vendors.

**Open Questions**:
- Which email provider? (Agent-native like AgentMail vs. traditional like Mailgun)
- Own domain vs. provider-supplied addresses?

---

### Milestone 4: hosted-agent-infrastructure

**Definition of Done**:
- Agent runs in AWS ECS Fargate
- API endpoint: `POST /v1/jobs` - start provisioning job
- API endpoint: `GET /v1/jobs/:id` - get job status and result
- Basic auth (API keys) for access control
- Jobs execute asynchronously, status polling works
- Logs accessible to operators
- Browser runs in same container (isolation is later milestone)

**Execution Model** (Monolithic for M4):
- Single container type runs both Hono API server and job worker
- In-process job queue with mutex ensures sequential browser execution
- Browser constraint: 1 active browser = 1 concurrent job per container
- Horizontal scaling: add container replicas, each handles 1 concurrent job

**Why this is a safe pause point**: Agent is hosted and API-accessible. Can be triggered remotely.

**Unlocks**: CLI integration, multi-user access, browser manipulation work.

---

### Milestone 4b: persistent-job-infrastructure

**Definition of Done**:
- Jobs survive container restarts
- Job history queryable by user, status, date range
- Job step history preserved for debugging
- TTL-based cleanup for old jobs

**Why this is a safe pause point**: Jobs are durable. Container restarts don't lose state.

**Unlocks**: Reliable job tracking. Horizontal scaling.

**Open Questions**:
- Separate (DynamoDB + SQS) vs unified (Temporal)?
- Job retention period?

---

### Milestone 5: agent-browser-manipulation

**Definition of Done**:
- Browser automation library finalized
- Browser runs reliably in hosted AWS environment
- Browser isolation strategy decided and implemented
- PCI-compliant execution verified
- Handles common edge cases: popups, iframes, dynamic content, cookie banners
- Browser crash/timeout recovery implemented
- Screenshot capture for debugging

**Why this is a safe pause point**: Browser automation works reliably in the hosted environment.

**Unlocks**: Page perception development, real vendor testing.

---

### Milestone 5a: page-perception-layer

**Definition of Done**:
- `PagePerception` interface with swappable strategy pattern
- Strategies: ARIA-snapshot (baseline), vision-based, hybrid
- Page type classification, form intelligence, element matching
- Error & feedback extraction, dynamic content handling
- Evaluation framework with test suite and metrics

**Why this is a safe pause point**: Robust page understanding that generalizes across vendors.

**Unlocks**: Reliable skills development, better behavioral composition.

---

### Milestone 6: user-accounts-and-cli

**Definition of Done**:
- User database with basic auth
- API endpoints for registration and login
- CLI tools: `fg auth login`, `fg provision`, `fg jobs list/status`
- Jobs associated with user

**Why this is a safe pause point**: End-to-end user flow works via CLI (except payment).

**Unlocks**: Internal alpha testing, web UI.

---

### Milestone 6a: web-application-infrastructure

**Definition of Done**:
- Next.js application deployed on AWS
- Component library foundation
- API client layer with typed endpoints
- User authentication UI (signup, login, password reset)
- Payment method entry (Stripe Elements integration)

**Key Principle**: Credit card details NEVER pass through our servers. Stripe Elements captures card input client-side.

**Why this is a safe pause point**: Web application foundation in place with auth UI and payment card collection.

**Unlocks**: M8 (card on file), M13 (web auth upgrade).

---

### Milestone 7: agent-events-and-observability

**Definition of Done**:
- Event schema for high-level agent events
- Events streamed to clients (WebSocket, SSE, or polling)
- `fg provision` displays live TUI progress
- Events persisted for later retrieval

**Why this is a safe pause point**: Users can watch provisioning in real-time.

**Unlocks**: Rich CLI experience, operator debugging.

---

### Milestone 8: card-on-file

**Definition of Done**:
- User can add payment card (Stripe Payment Methods)
- Provisioning job charges card on file before issuing virtual card
- Refund difference if virtual card charge < authorized amount
- Refund in full if provisioning fails

**Why this is a safe pause point**: Users can pay for provisioning. Real money flows through system.

**Unlocks**: Path to external users. KYC integration point.

---

### Milestone 9: credential-vault

**Definition of Done**:
- `CredentialVault` interface (provider-agnostic)
- Store credentials with: user ID, vendor, type, encrypted value, timestamp
- API and CLI for listing/retrieving credentials
- Credentials encrypted at rest

**Why this is a safe pause point**: Users can access credentials from provisioned services.

**Unlocks**: Full alpha utility.

---

### Milestone 10: behavioral-composition

**Definition of Done**:
- Behavioral primitives defined (signup, login, verify_email, etc.)
- State model tracking user+vendor state
- State-aware planning, primitive chaining, alternative paths
- Primitive library documented and reusable across vendors

**Why this is a safe pause point**: Agent can reason about state and compose workflows dynamically.

**Unlocks**: Efficient re-provisioning, credential rotation.

---

### Milestone 11: skills-library-expansion

**Definition of Done**:
- 10-15 vendor-specific skills tested against production
- Tech skills for common checkouts
- Improved generic fallback
- Braintrust evals integration with baseline metrics

**Why this is a safe pause point**: Reasonable vendor coverage with measurable quality.

**Unlocks**: Alpha launch readiness.

---

### Milestone 12: alpha-launch

**Definition of Done**:
- All M1-M11 complete and verified working together
- End-to-end tested with at least 5 real vendors
- Known limitations documented, basic runbook, monitoring in place

**Why this is a safe pause point**: Internal users actively using the product.

**Unlocks**: Learning from usage to inform beta hardening.

---

### Milestone 13: production-auth-infrastructure

**Definition of Done**:
- Industrial API key management (Unkey or similar)
- Web app authentication (OAuth, magic link)
- CLI authentication (API key, browser OAuth, device flow)
- Audit logging

**Why this is a safe pause point**: Production-grade auth. Ready for external users.

**Unlocks**: Beta launch.

---

### Milestone 14: beta-hardening

**Definition of Done**:
- Polished web UI, session recordings, browser isolation
- Error handling and retry improvements
- Rate limiting and abuse prevention
- Recurring charge handling for subscriptions
- Split into separate API + Worker containers with SQS

**Why this is a safe pause point**: Ready for external trusted users.

**Unlocks**: External beta.

---

### Milestone 15: sms-verification

**Definition of Done**:
- `SmsResolver` interface, one provider implementation
- Phone number pool management, wait for SMS, extract code

**Why this is a safe pause point**: Agent handles SMS verification.

**Unlocks**: Vendors requiring phone verification.

---

### Milestone 16: ga-preparation

**Definition of Done**:
- Security audit, PCI compliance review, production hardening
- Monitoring and alerting, end user documentation

**Why this is a safe pause point**: Production-ready product.

**Unlocks**: General availability.

## Dependency Graph

```
1 (Secret Handling) → []
2 (CLI Interface Design) → [1]
3 (Email Verification) → [1]
4 (Hosted Agent) → [1]
4b (Persistent Job Infrastructure) → [4]
4c (Mercury Card for Dev) → [4]
5 (Browser Manipulation) → [4]
5a (Page Perception) → [5]
6 (Users + CLI) → [2, 4]
6a (Web App Infrastructure) → [4, 6]
7 (Agent Events & Observability) → [2, 6]
8 (Card on File) → [6, 6a]
9 (Credential Vault) → [8]
10 (Behavioral Composition) → [5a, 9]
11 (Skills Library) → [3, 5a, 10]
12 (Alpha Launch) → [4b, 9, 11]
13 (Production Auth) → [6a, 12]
14 (Beta Hardening) → [13]
15 (SMS) → [1]
16 (GA Prep) → [14]
```

**Parallelization opportunities**:
- Milestones 2, 3, and 4 can run in parallel after 1
- Milestones 4b, 4c, 5, and 6 can run in parallel after 4
- Milestone 5a follows 5; can run in parallel with 6a and 7
- Milestone 15 (SMS) can happen anytime after 1 (independent track)

## Open Questions

| Question | Notes | Resolve By |
|----------|-------|------------|
| Job infrastructure | Separate (DynamoDB + SQS) vs unified (Temporal) | Milestone 4b |
| Email provider | AgentMail vs. Mailgun vs. others | Milestone 3 |
| Browser isolation | Browserbase vs. self-hosted containers | Milestone 5 |
| Perception approach | Vision-first vs text-first vs hybrid | Milestone 5a |
| Card issuer | Stripe vs. Lithic vs. Marqeta | Before beta |
| Credential vault | AWS Secrets Manager vs. HashiCorp Vault vs. encrypted DB | Milestone 9 |
| KYC provider | Stripe Identity vs. Persona vs. Onfido | KYC Milestone K2 |
| API key provider | Unkey vs. built-in auth provider features | Milestone 13 |
| Web app auth | BetterAuth vs. Auth.js vs. Lucia | Milestone 13 |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Secret refs over direct values | LLM must never see card details or credentials. `{{SECRET}}` pattern is provider-agnostic and auditable. |
| Provider-agnostic interfaces | CardIssuer, EmailResolver, CredentialVault, SmsResolver are all interfaces. Swap providers without architectural changes. |
| CLI as primary trigger | Users (or Claude Code) trigger via CLI. Web UI is for account management, not provisioning. |
| Alpha before polish | Get end-to-end working with internal users before investing in UI polish. |
| Virtual card intermediation | We issue virtual cards instead of charging vendors directly. Provides anonymization, spending controls, fraud protection. |
| Charge upfront, refund difference | Charge card on file when issuing virtual card. Refund any unused amount after provisioning completes. |
| Composable behavioral primitives | Decompose workflows into reusable primitives that compose based on user+vendor state. |
| Monolithic → Separated execution | M4 monolithic; M14 evolves to separated API + Worker with SQS queue. |
| SST v3 for infrastructure | TypeScript-native IaC matching our codebase language. |
| ECS Fargate over Lambda | Provisioning jobs run 30+ seconds with browser automation. Fargate provides consistent performance. |
| Hono for API framework | Lightweight, Bun-native, excellent TypeScript support. |
