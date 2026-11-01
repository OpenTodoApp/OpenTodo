package channels

import (
	"strings"
	"unicode/utf8"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
)

// Message is what a channel receives, rendered when the event is queued. It
// names the task and the actor only when the content policy allows it (design D4).
type Message struct {
	Event     string `json:"event"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	URL       string `json:"url,omitempty"`
	TaskID    string `json:"taskId,omitempty"`
	PageID    string `json:"pageId,omitempty"`
	TaskTitle string `json:"taskTitle,omitempty"`
	ActorName string `json:"actorName,omitempty"`
	CreatedAt int64  `json:"createdAt"`
}

// Text keys of the message table.
const (
	txtReminder     = "reminder"
	txtAssigned     = "assigned"
	txtMentioned    = "mentioned"
	txtUnblocked    = "unblocked"
	txtPageReplied  = "page_replied"
	txtPageDone     = "page_completed"
	txtPageReopened = "page_reopened"
	// With content: the line under the task's title.
	txtReminderWith   = "reminder_with"
	txtAssignedBy     = "assigned_by"
	txtMentionedBy    = "mentioned_by"
	txtUnblockedWith  = "unblocked_with"
	txtPageRepliedBy  = "page_replied_by"
	txtPageDoneBy     = "page_completed_by"
	txtPageReopenedBy = "page_reopened_by"
	txtRoutine        = "routine"
	// A routine's failed run (routines-editor D11): generic, and under its name.
	txtRoutineFailed     = "routine_failed"
	txtRoutineFailedWith = "routine_failed_with"
	txtTestTitle         = "test_title"
	txtTestBody          = "test_body"
	txtGuest             = "guest"
	maxTitleRunes        = 120
	maxBodyRunes         = 300
	genericMessageTitle  = "OpenTodo"
)

// texts holds every message in the six app languages. {name} is the actor.
var texts = map[string]map[string]string{
	"en": {
		txtRoutine:       "A routine sent you a notice",
		txtRoutineFailed: "A routine failed", txtRoutineFailedWith: "It did not finish. Open the run to see why.",
		txtReminder: "A reminder is due", txtAssigned: "A task was assigned to you", txtMentioned: "You were mentioned",
		txtUnblocked: "A task you're assigned to is ready to start", txtPageReplied: "A guest replied on a task page",
		txtPageDone: "A guest completed a task page", txtPageReopened: "A guest reopened a task page",
		txtReminderWith: "Reminder", txtAssignedBy: "{name} assigned this task to you", txtMentionedBy: "{name} mentioned you",
		txtUnblockedWith: "Ready to start", txtPageRepliedBy: "{name} replied on the task page",
		txtPageDoneBy: "{name} completed the task on its page", txtPageReopenedBy: "{name} reopened the task on its page",
		txtTestTitle: "Test from OpenTodo", txtTestBody: "This channel works.", txtGuest: "A guest",
	},
	"de": {
		txtRoutine:       "Eine Routine hat dir eine Nachricht geschickt",
		txtRoutineFailed: "Eine Routine ist fehlgeschlagen", txtRoutineFailedWith: "Sie wurde nicht beendet. Öffne den Lauf, um den Grund zu sehen.",
		txtReminder: "Eine Erinnerung ist fällig", txtAssigned: "Dir wurde eine Aufgabe zugewiesen", txtMentioned: "Du wurdest erwähnt",
		txtUnblocked: "Eine dir zugewiesene Aufgabe kann beginnen", txtPageReplied: "Ein Gast hat auf einer Aufgabenseite geantwortet",
		txtPageDone: "Ein Gast hat eine Aufgabenseite erledigt", txtPageReopened: "Ein Gast hat eine Aufgabenseite wieder geöffnet",
		txtReminderWith: "Erinnerung", txtAssignedBy: "{name} hat dir diese Aufgabe zugewiesen", txtMentionedBy: "{name} hat dich erwähnt",
		txtUnblockedWith: "Kann beginnen", txtPageRepliedBy: "{name} hat auf der Aufgabenseite geantwortet",
		txtPageDoneBy: "{name} hat die Aufgabe auf ihrer Seite erledigt", txtPageReopenedBy: "{name} hat die Aufgabe auf ihrer Seite wieder geöffnet",
		txtTestTitle: "Test von OpenTodo", txtTestBody: "Dieser Kanal funktioniert.", txtGuest: "Ein Gast",
	},
	"fr": {
		txtRoutine:       "Une routine vous a envoyé un avis",
		txtRoutineFailed: "Une routine a échoué", txtRoutineFailedWith: "Elle ne s’est pas terminée. Ouvrez l’exécution pour voir pourquoi.",
		txtReminder: "Un rappel arrive à échéance", txtAssigned: "Une tâche vous a été attribuée", txtMentioned: "Vous avez été mentionné",
		txtUnblocked: "Une tâche qui vous est attribuée peut commencer", txtPageReplied: "Un invité a répondu sur une page de tâche",
		txtPageDone: "Un invité a terminé une page de tâche", txtPageReopened: "Un invité a rouvert une page de tâche",
		txtReminderWith: "Rappel", txtAssignedBy: "{name} vous a attribué cette tâche", txtMentionedBy: "{name} vous a mentionné",
		txtUnblockedWith: "Peut commencer", txtPageRepliedBy: "{name} a répondu sur la page de la tâche",
		txtPageDoneBy: "{name} a terminé la tâche sur sa page", txtPageReopenedBy: "{name} a rouvert la tâche sur sa page",
		txtTestTitle: "Test d’OpenTodo", txtTestBody: "Ce canal fonctionne.", txtGuest: "Un invité",
	},
	"es": {
		txtRoutine:       "Una rutina te envió un aviso",
		txtRoutineFailed: "Una rutina falló", txtRoutineFailedWith: "No terminó. Abre la ejecución para ver por qué.",
		txtReminder: "Hay un recordatorio pendiente", txtAssigned: "Se te ha asignado una tarea", txtMentioned: "Te han mencionado",
		txtUnblocked: "Una tarea asignada a ti ya puede empezar", txtPageReplied: "Un invitado respondió en una página de tarea",
		txtPageDone: "Un invitado completó una página de tarea", txtPageReopened: "Un invitado reabrió una página de tarea",
		txtReminderWith: "Recordatorio", txtAssignedBy: "{name} te ha asignado esta tarea", txtMentionedBy: "{name} te ha mencionado",
		txtUnblockedWith: "Ya puede empezar", txtPageRepliedBy: "{name} respondió en la página de la tarea",
		txtPageDoneBy: "{name} completó la tarea en su página", txtPageReopenedBy: "{name} reabrió la tarea en su página",
		txtTestTitle: "Prueba de OpenTodo", txtTestBody: "Este canal funciona.", txtGuest: "Un invitado",
	},
	"it": {
		txtRoutine:       "Una routine ti ha inviato un avviso",
		txtRoutineFailed: "Una routine non è riuscita", txtRoutineFailedWith: "Non è stata completata. Apri l’esecuzione per vedere perché.",
		txtReminder: "C’è un promemoria in scadenza", txtAssigned: "Ti è stata assegnata un’attività", txtMentioned: "Sei stato menzionato",
		txtUnblocked: "Un’attività assegnata a te può iniziare", txtPageReplied: "Un ospite ha risposto su una pagina dell’attività",
		txtPageDone: "Un ospite ha completato una pagina dell’attività", txtPageReopened: "Un ospite ha riaperto una pagina dell’attività",
		txtReminderWith: "Promemoria", txtAssignedBy: "{name} ti ha assegnato questa attività", txtMentionedBy: "{name} ti ha menzionato",
		txtUnblockedWith: "Può iniziare", txtPageRepliedBy: "{name} ha risposto sulla pagina dell’attività",
		txtPageDoneBy: "{name} ha completato l’attività sulla sua pagina", txtPageReopenedBy: "{name} ha riaperto l’attività sulla sua pagina",
		txtTestTitle: "Prova da OpenTodo", txtTestBody: "Questo canale funziona.", txtGuest: "Un ospite",
	},
	"pt": {
		txtRoutine:       "Uma rotina enviou um aviso para você",
		txtRoutineFailed: "Uma rotina falhou", txtRoutineFailedWith: "Ela não terminou. Abra a execução para ver o motivo.",
		txtReminder: "Há um lembrete pendente", txtAssigned: "Uma tarefa foi atribuída a você", txtMentioned: "Você foi mencionado",
		txtUnblocked: "Uma tarefa atribuída a você já pode começar", txtPageReplied: "Um convidado respondeu em uma página de tarefa",
		txtPageDone: "Um convidado concluiu uma página de tarefa", txtPageReopened: "Um convidado reabriu uma página de tarefa",
		txtReminderWith: "Lembrete", txtAssignedBy: "{name} atribuiu esta tarefa a você", txtMentionedBy: "{name} mencionou você",
		txtUnblockedWith: "Já pode começar", txtPageRepliedBy: "{name} respondeu na página da tarefa",
		txtPageDoneBy: "{name} concluiu a tarefa na página dela", txtPageReopenedBy: "{name} reabriu a tarefa na página dela",
		txtTestTitle: "Teste do OpenTodo", txtTestBody: "Este canal funciona.", txtGuest: "Um convidado",
	},
}

func text(lang, key, name string) string {
	m := texts[lang]
	if m == nil {
		m = texts["en"]
	}
	v := m[key]
	if v == "" {
		v = texts["en"][key]
	}
	return strings.ReplaceAll(v, "{name}", name)
}

// clip shortens s to n runes on one line, with an ellipsis when cut.
func clip(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)
	return strings.TrimSpace(string(r[:n-1])) + "…"
}

// plain is a value that may leave the server: empty for ciphertext.
func plain(v string) string {
	if e2ee.IsCiphertext(v) {
		return ""
	}
	return v
}

// event is one notification before the content policy and the language apply.
type event struct {
	kind      string // an Events name
	key       string // the generic text key
	withKey   string // the text key under the task title, with content
	taskID    string
	pageID    string
	taskTitle string
	actorName string
	excerpt   string
	at        int64
	// runID links a routine notice to its run.
	runID string
}

// render applies the content policy and the channel's language. content says
// whether titles, names and excerpts may leave (include_titles on and the
// account not encrypted); ciphertext never does.
func (e event) render(lang, origin string, content bool) Message {
	m := Message{Event: e.kind, TaskID: e.taskID, PageID: e.pageID, CreatedAt: e.at}
	if origin != "" && e.taskID != "" {
		m.URL = origin + "/?task=" + e.taskID
	}
	if e.kind == EventRoutine {
		// A routine's notice: its name and the step's text, or the generic line.
		if origin != "" {
			m.URL = origin + "/routines?run=" + e.runID
		}
		name, body := plain(e.taskTitle), plain(e.excerpt)
		if body == "" && e.withKey != "" {
			body = text(lang, e.withKey, "")
		}
		if !content || name == "" || body == "" {
			m.Title, m.Body = genericMessageTitle, text(lang, e.key, "")
			return m
		}
		m.Title, m.Body = clip(name, maxTitleRunes), clip(body, maxBodyRunes)
		return m
	}
	title, actor := plain(e.taskTitle), plain(e.actorName)
	if !content || title == "" {
		m.Title, m.Body = genericMessageTitle, text(lang, e.key, "")
		return m
	}
	m.TaskTitle, m.ActorName = clip(title, maxTitleRunes), clip(actor, maxTitleRunes)
	m.Title = m.TaskTitle
	name := m.ActorName
	if name == "" {
		name = text(lang, txtGuest, "")
	}
	m.Body = text(lang, e.withKey, name)
	if ex := plain(e.excerpt); ex != "" {
		m.Body += ": " + ex
	}
	m.Body = clip(m.Body, maxBodyRunes)
	return m
}

// testMessage is the message Send test delivers.
func testMessage(lang, origin string, at int64) Message {
	m := Message{Event: eventTest, Title: text(lang, txtTestTitle, ""), Body: text(lang, txtTestBody, ""), CreatedAt: at}
	if origin != "" {
		m.URL = origin + "/"
	}
	return m
}
