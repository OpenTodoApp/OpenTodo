// Says plainly when the browser is too old for the app (GitHub issue 1259), before
// the app's code runs: the interface needs the CSS of Chrome and Android System
// WebView 111, Safari 16.4 and Firefox 128 (oklch and color-mix colours, container
// queries). An older engine gets this note instead of a blank or broken page; on
// Android the app uses the system WebView, which some devices cannot update.
// A classic same-origin script in ES5 (the server's CSP forbids inline scripts),
// with its own short texts, because the app's translations load with the app.
(function () {
  var css = window.CSS && CSS.supports
  var ok = css && CSS.supports('color', 'oklch(50% 0.1 120)') && CSS.supports('color', 'color-mix(in oklab, red, blue)') && CSS.supports('container-type', 'inline-size')
  if (ok) return
  var texts = {
    en: ['This browser is too old for OpenTodo', 'OpenTodo needs Chrome or Android System WebView 111, Safari 16.4 or Firefox 128, or later.', 'On Android, the OpenTodo app shows the server through the phone\'s system WebView. If it cannot be updated, open your server\'s address in a browser that brings its own engine, such as Firefox, and add it to the home screen.', 'This one reports'],
    de: ['Dieser Browser ist zu alt für OpenTodo', 'OpenTodo braucht Chrome oder Android System WebView 111, Safari 16.4 oder Firefox 128 oder neuer.', 'Unter Android zeigt die OpenTodo-App den Server über das System-WebView des Telefons. Lässt es sich nicht aktualisieren, öffne die Adresse deines Servers in einem Browser mit eigener Engine, etwa Firefox, und lege sie auf den Startbildschirm.', 'Dieser meldet'],
    fr: ['Ce navigateur est trop ancien pour OpenTodo', 'OpenTodo nécessite Chrome ou Android System WebView 111, Safari 16.4 ou Firefox 128, ou plus récent.', 'Sur Android, l’application OpenTodo affiche le serveur dans le WebView système du téléphone. S’il ne peut pas être mis à jour, ouvrez l’adresse de votre serveur dans un navigateur doté de son propre moteur, comme Firefox, et ajoutez-la à l’écran d’accueil.', 'Celui-ci indique'],
    es: ['Este navegador es demasiado antiguo para OpenTodo', 'OpenTodo necesita Chrome o Android System WebView 111, Safari 16.4 o Firefox 128, o posterior.', 'En Android, la app de OpenTodo muestra el servidor con el WebView del sistema del teléfono. Si no se puede actualizar, abre la dirección de tu servidor en un navegador con motor propio, como Firefox, y añádela a la pantalla de inicio.', 'Este indica'],
    it: ['Questo browser è troppo vecchio per OpenTodo', 'OpenTodo richiede Chrome o Android System WebView 111, Safari 16.4 o Firefox 128, o successivi.', 'Su Android, l’app OpenTodo mostra il server tramite il WebView di sistema del telefono. Se non si può aggiornare, apri l’indirizzo del tuo server in un browser con un motore proprio, come Firefox, e aggiungilo alla schermata Home.', 'Questo riporta'],
    pt: ['Este navegador é antigo demais para o OpenTodo', 'O OpenTodo precisa do Chrome ou do Android System WebView 111, do Safari 16.4 ou do Firefox 128, ou mais recentes.', 'No Android, o app OpenTodo mostra o servidor pelo WebView do sistema do telefone. Se ele não puder ser atualizado, abra o endereço do seu servidor num navegador com motor próprio, como o Firefox, e adicione-o à tela inicial.', 'Este informa'],
    nl: ['Deze browser is te oud voor OpenTodo', 'OpenTodo heeft Chrome of Android System WebView 111, Safari 16.4 of Firefox 128 nodig, of nieuwer.', 'Op Android toont de OpenTodo-app de server via de systeem-WebView van de telefoon. Kan die niet worden bijgewerkt, open dan het adres van je server in een browser met een eigen engine, zoals Firefox, en zet het op je beginscherm.', 'Deze meldt'],
    zh: ['此浏览器版本过旧，无法运行 OpenTodo', 'OpenTodo 需要 Chrome 或 Android System WebView 111、Safari 16.4 或 Firefox 128 及以上版本。', '在 Android 上，OpenTodo 应用通过手机的系统 WebView 显示服务器。如果它无法更新，请在自带内核的浏览器（例如 Firefox）中打开你的服务器地址，并添加到主屏幕。', '此浏览器报告'],
  }
  var lang = (navigator.language || 'en').toLowerCase().slice(0, 2)
  var t = texts[lang] || texts.en
  var ua = navigator.userAgent || ''
  var m = /(Chrome)\/([0-9.]+)/.exec(ua) || /(Firefox)\/([0-9.]+)/.exec(ua) || /(Version)\/([0-9.]+)/.exec(ua)
  var show = function () {
    var root = document.getElementById('root')
    var first = root && root.firstChild
    if (!root || (first && first.getAttribute && first.getAttribute('data-browser-too-old') !== null)) return
    root.innerHTML = ''
    var box = document.createElement('div')
    box.setAttribute('role', 'alert')
    box.setAttribute('data-browser-too-old', '')
    box.style.cssText = 'max-width:32rem;margin:15vh auto 0;padding:0 1.25rem;font:16px/1.5 system-ui,sans-serif;color:#1f2328;background:#fff'
    var add = function (tag, text, style) { var el = document.createElement(tag); el.textContent = text; el.style.cssText = style; box.appendChild(el) }
    add('h1', t[0], 'font-size:1.25rem;margin:0 0 .75rem')
    add('p', t[1], 'margin:0 0 .75rem')
    add('p', t[2], 'margin:0 0 .75rem')
    if (m) add('p', t[3] + ': ' + m[1] + ' ' + m[2], 'margin:0;color:#59636e;font-size:.875rem')
    root.appendChild(box)
    document.documentElement.style.background = '#fff'
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show)
  else show()
  // The app's code may still start and draw over the note: put it back once.
  window.addEventListener('load', function () { setTimeout(show, 1500) })
})()
