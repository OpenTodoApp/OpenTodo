{{/* Name and labels, as in helm create. */}}
{{- define "opentodo.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "opentodo.fullname" -}}
{{- if contains .Chart.Name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "opentodo.selectorLabels" -}}
app.kubernetes.io/name: {{ include "opentodo.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "opentodo.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "opentodo.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/* The image: the tag defaults to the chart's appVersion, the release it was published with. */}}
{{- define "opentodo.image" -}}
{{- printf "%s:%s" .Values.image.repository (.Values.image.tag | default .Chart.AppVersion) }}
{{- end }}

{{/* The Secret holding OPENTODO_SETUP_TOKEN, or empty when there is none. */}}
{{- define "opentodo.setupTokenSecret" -}}
{{- if .Values.setupToken.existingSecret }}
{{- .Values.setupToken.existingSecret }}
{{- else if .Values.setupToken.generate }}
{{- printf "%s-setup-token" (include "opentodo.fullname" .) }}
{{- end }}
{{- end }}

{{/* OPENTODO_BASE_URL: the value from env, or https://<ingress.host> for an Ingress with tls. */}}
{{- define "opentodo.baseUrl" -}}
{{- $v := index .Values.env "OPENTODO_BASE_URL" | default "" }}
{{- if and (not $v) .Values.ingress.enabled .Values.ingress.tls }}
{{- printf "https://%s" .Values.ingress.host }}
{{- else }}
{{- $v }}
{{- end }}
{{- end }}
