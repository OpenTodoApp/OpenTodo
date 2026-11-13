// Capture, in its first form (native-app-everyday 1.1): a sheet with the field focused,
// Return adds the task and keeps the sheet open for the next one. A task added from
// Today is due today (the web's context rule). Parsing as you type, the toolbar and the
// pickers are task 3.1.
import * as Haptics from 'expo-haptics'
import { useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { logicalToday } from '@shared/dates'
import { t } from '@shared/i18n'
import { createTask } from '@shared/ops'
import { useColors } from '../theme'

export default function CaptureSheet({ from }: { from: string | undefined }) {
  const c = useColors()
  const [title, setTitle] = useState('')
  const add = () => {
    const text = title.trim()
    if (!text) return
    setTitle('')
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void createTask({ title: text, ...(from === 'Today' ? { due: { date: logicalToday() } } : {}) })
  }
  return (
    <View style={[styles.sheet, { backgroundColor: c.bg }]}>
      <TextInput
        accessibilityLabel={t('New task')}
        autoFocus
        blurOnSubmit={false}
        onChangeText={setTitle}
        onSubmitEditing={add}
        placeholder={t('New task')}
        placeholderTextColor={c.muted}
        returnKeyType="done"
        style={[styles.field, { color: c.text }]}
        testID="capture-title"
        value={title}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  field: { fontSize: 20, paddingVertical: 8 },
})
