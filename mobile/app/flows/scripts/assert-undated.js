// The newest task with TITLE has no do-on date: it was captured into the Inbox.
var found = null
for (var i = 0; i < 40 && !found; i++) {
  var res = http.get(API + '/api/v1/tasks?limit=200', { headers: { Authorization: 'Bearer ' + TOKEN } })
  if (!res.ok) throw new Error('list tasks: ' + res.status + ' ' + res.body)
  var body = json(res.body)
  var list = (body.tasks || body.items || body).filter(function (t) { return t.title === TITLE && !t.completed_at })
  list.sort(function (a, b) { return b.created_at - a.created_at })
  found = list[0] || null
}
if (!found) throw new Error('no task titled ' + TITLE + ' on the server')
if (found.due) throw new Error(TITLE + ' has a do-on date: ' + JSON.stringify(found.due))
