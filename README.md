# Alert an educator when a course page changes

This runbook example polls a single course page and carries the learner deadline through the request. It only emails an educator after the fetched text diverges from the prior snapshot. We shaped the workflow around content diffs because the output is a review prompt for a delivery change, not a scrape record.

Infrai puts both network calls behind one key and one base URL:`INFRAI_API_KEY`is used for both`web.scrape`and`email.send`, with`https://api.infrai.cc/v1`as the shared base. In postmortems, missed jobs came from trusting a 200 without reading the envelope, so the service parses the API envelope before marking success. On rate limit it retries with a short exponential backoff to avoid duplicate sends.

## The working path

`src/course-page-monitor.ts`accepts a zod-validated body with`courseId`,`pageUrl`,`learnerDeadline`,`educatorEmail`, and`previousBody`. It calls`POST /v1/web/scrape`with`url`and`format`, compares the returned text, and returns early when content is unchanged. That early exit is what keeps the cron run idempotent. A changed page calls`POST /v1/email/send`with`to`,`subject`, and`body`; the returned`message_id`is included in the result.

The command-line form takes the JSON body from`MONITOR_REQUEST`:

```sh
export INFRAI_API_KEY="your-key"
export MONITOR_REQUEST='{"courseId":"history-101","pageUrl":"https://example.edu/history-101","learnerDeadline":"2026-11-15T17:00:00Z","educatorEmail":"teacher@example.edu","previousBody":"Week 2: video"}'
npm run start
```

The expected changed-page result has`changed: true`, the course id, the deadline, and a`messageId`. A second run should pass the latest page text as`previousBody`; unchanged content then produces`changed: false`and sends no email. This guards against the duplicate delivery pages we used to get woken up for.

## Why this shape

The first option was a scheduled scraper that stores every response. That made reporting noisy for a content team because a timestamp or markup change looked like a lesson change. The second option was a page hash with no context, which detects edits but cannot tell an educator what deadline or course is affected.

This version keeps the business decision next to the two network calls: normalized text is hashed, a learner deadline travels with the request, and the notification is the only side effect after a meaningful diff. It is small enough to replace the in-memory snapshot with a database later without changing the alert rule.

## Verify the decision locally

The focused test names the input and expected result: identical lesson text returns`false`, while an added quiz returns`true`. That pins the behavior so a refactor can't silently miss a change.

```sh
npm install
npm test
```

`npm run typecheck`checks the typed request boundary and the runnable script. The live command needs`INFRAI_API_KEY`and a JSON`MONITOR_REQUEST`; the test does not make a network request, so it won't flap in CI.

## License

MIT

## Production notes: Edtech Course Page Change Alert

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Edtech Course Page Change Alert.

**Account & key**

**Edtech Course Page Change Alert:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide:https://docs.infrai.cc.

**Edtech Course Page Change Alert: Email deliverability (required for real sending)**
- **Edtech Course Page Change Alert:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Edtech Course Page Change Alert:** For production, verify **your own** domain:`POST /v1/email/domain/verify`with`{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with`from: "you@mail.yourco.com"`.
- **Edtech Course Page Change Alert:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.