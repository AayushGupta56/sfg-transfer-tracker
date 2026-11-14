#!/usr/bin/env bash
# End-to-end check of the send -> receive -> trail flow over real HTTP.
B=${BASE:-http://localhost:3100}
S=$(mktemp -d)
post() { curl -s -b "$S/$1" -c "$S/$1" -X POST -H 'Content-Type: application/json' "$B$2" -d "$3"; echo; }
get()  { curl -s -b "$S/$1" "$B$2"; echo; }

for i in $(seq 1 30); do curl -s -o /dev/null "$B/api/job-orders" && break; sleep 1; done

echo "== login as sender (Plant 2) and receiver (Plant 3) and an outsider (Plant 1)"
post sender   /api/session '{"name":"Test Sender","plantCode":"1200"}'
post receiver /api/session '{"name":"Test Receiver","plantCode":"1300"}'
post outsider /api/session '{"name":"Test Outsider","plantCode":"1100"}'

echo "== RULES on send (each must be rejected)"
post anon   /api/transfers '{"toPlantCode":"1300","jobOrderNo":"JO-26-0101","lines":[{"materialNumber":"SM-2003","qty":4}],"idempotencyKey":"k0"}'
post sender /api/transfers '{"toPlantCode":"1200","jobOrderNo":"JO-26-0101","lines":[{"materialNumber":"SM-2003","qty":4}],"idempotencyKey":"k1"}'
post sender /api/transfers '{"toPlantCode":"1300","jobOrderNo":"JO-26-0090","lines":[{"materialNumber":"SM-2001","qty":4}],"idempotencyKey":"k2"}'
post sender /api/transfers '{"toPlantCode":"1300","jobOrderNo":"JO-26-0101","lines":[{"materialNumber":"SM-2004","qty":4}],"idempotencyKey":"k3"}'
post sender /api/transfers '{"toPlantCode":"1300","jobOrderNo":"JO-26-0101","lines":[{"materialNumber":"SM-2003","qty":-2}],"idempotencyKey":"k4"}'
post sender /api/transfers '{"toPlantCode":"1300","jobOrderNo":"JO-99","lines":[{"materialNumber":"SM-2003","qty":2}],"idempotencyKey":"k5"}'

echo "== SEND (valid) — then resend same idempotency key (must return SAME id, no duplicate)"
KEY="e2e-$(date +%s)"
R=$(post sender /api/transfers "{\"toPlantCode\":\"1300\",\"jobOrderNo\":\"JO-26-0101\",\"lines\":[{\"materialNumber\":\"SM-2003\",\"qty\":4},{\"materialNumber\":\"SM-2001\",\"qty\":2}],\"vehicleRef\":\"Truck E2E\",\"idempotencyKey\":\"$KEY\"}")
echo "$R"
post sender /api/transfers "{\"toPlantCode\":\"1300\",\"jobOrderNo\":\"JO-26-0101\",\"lines\":[{\"materialNumber\":\"SM-2003\",\"qty\":4},{\"materialNumber\":\"SM-2001\",\"qty\":2}],\"idempotencyKey\":\"$KEY\"}"
ID=$(echo "$R" | sed -E 's/.*"id":([0-9]+).*/\1/')

echo "== RULES on receive (each must be rejected)"
post sender   /api/transfers/$ID/receive '{"lines":[{"materialNumber":"SM-2003","qtyReceived":4},{"materialNumber":"SM-2001","qtyReceived":2}]}'
post outsider /api/transfers/$ID/receive '{"lines":[{"materialNumber":"SM-2003","qtyReceived":4},{"materialNumber":"SM-2001","qtyReceived":2}]}'
post receiver /api/transfers/$ID/receive '{"lines":[{"materialNumber":"SM-2003","qtyReceived":3},{"materialNumber":"SM-2001","qtyReceived":2}]}'
post receiver /api/transfers/$ID/receive '{"lines":[{"materialNumber":"SM-2003","qtyReceived":4}]}'
post outsider /api/transfers/$ID/cancel '{"reason":"not mine"}'

echo "== RECEIVE (valid, 1 short) — then try to receive again (must be rejected)"
post receiver /api/transfers/$ID/receive '{"lines":[{"materialNumber":"SM-2003","qtyReceived":3,"reason":"SHORT","note":"1 frame missing"},{"materialNumber":"SM-2001","qtyReceived":2}],"remarks":"e2e"}'
post receiver /api/transfers/$ID/receive '{"lines":[{"materialNumber":"SM-2003","qtyReceived":4},{"materialNumber":"SM-2001","qtyReceived":2}]}'
post sender   /api/transfers/$ID/cancel '{"reason":"too late"}'

echo "== RESOLVE discrepancy (sender side)"
post sender /api/transfers/$ID/resolve '{"note":"Frame found at Plant 2, will send on next transfer"}'
post sender /api/transfers/$ID/resolve '{"note":"again"}'

echo "== SAP sync"
post sender /api/integration/sync '{}'

echo "== TRAIL for transfer $ID"
get sender /api/transfers/$ID | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s);
console.log(t.transferNo, t.status, "resolved:", !!t.resolvedAt, "GI doc:", t.sapGoodsIssueDoc, "GR doc:", t.sapGoodsReceiptDoc);
t.lines.forEach(l=>console.log("  line", l.materialNumber, "sent", l.qtySent, "recv", l.qtyReceived, l.discrepancyReason||""));
t.events.forEach(e=>console.log("  event", e.id, e.type.padEnd(26), e.actor.padEnd(16), e.plantCode, "|", e.message));
t.outbox.forEach(o=>console.log("  outbox", o.eventType, o.status, o.externalRef));})'

echo "== JOB ORDER view for JO-26-0101 (what the job order system would read)"
get sender /api/job-orders/JO-26-0101 | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);
console.log("readyToBuild:", j.readyToBuild, "complete:", j.completeCount+"/"+j.components.length);
j.components.forEach(c=>console.log("  ", c.materialNumber.padEnd(9), "need", c.required, "recv", c.received, "transit", c.inTransit, "outstanding", c.outstanding));})'

echo "== PAGES (HTTP status)"
for p in / /transfers /transfers/new /incoming /transfers/$ID /transfers/$ID/receive /transfers/$ID/slip /job-orders /job-orders/JO-26-0101 /audit /integration /whoami /transfers/99999 /api/export/audit; do
  printf "%-28s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' -b "$S/receiver" "$B$p")"
done
