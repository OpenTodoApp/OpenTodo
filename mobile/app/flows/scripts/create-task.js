// A task due today (or DAYS days from now), made through the REST API; its id is kept
// for the next scripts.
var today = new Date()
if (typeof DAYS !== 'undefined') today.setDate(today.getDate() + Number(DAYS))
var iso = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2)
var res = http.post(API + '/api/v1/tasks', {
  headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: TITLE, due: { date: iso } }),
})
if (!res.ok) throw new Error('create task: ' + res.status + ' ' + res.body)
output.taskId = json(res.body).id
