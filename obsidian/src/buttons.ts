import type { ButtonComponent } from 'obsidian'

/**
 * A destructive button on every Obsidian the plugin supports (1.8.7 and newer):
 * setWarning() only adds this class and is deprecated since 1.13, and
 * setDestructive() does not exist before 1.13, so the class is set directly.
 */
export function warning(b: ButtonComponent): ButtonComponent {
  b.buttonEl.addClass('mod-warning')
  return b
}
