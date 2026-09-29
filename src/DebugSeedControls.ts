import { parseSeed } from './SeededRandom'

// Viteの開発モードでだけ表示するSeed入力欄。盤面生成は通常プレイと同じ開始処理へ渡す。
export class DebugSeedControls {
  private readonly form: HTMLFormElement

  constructor(parent: HTMLElement, onStart: (seed: number) => void) {
    this.form = document.createElement('form')
    this.form.className = 'debug-seed-controls'
    this.form.setAttribute('aria-label', 'デバッグ用Seed指定')

    const label = document.createElement('label')
    label.htmlFor = 'debug-seed-input'
    label.textContent = 'デバッグSeed'

    const row = document.createElement('div')
    row.className = 'debug-seed-controls__row'

    const input = document.createElement('input')
    input.id = 'debug-seed-input'
    input.name = 'seed'
    input.type = 'text'
    input.inputMode = 'numeric'
    input.autocomplete = 'off'
    input.maxLength = 10
    input.placeholder = '0〜4294967295'
    input.setAttribute('aria-describedby', 'debug-seed-error')

    const button = document.createElement('button')
    button.type = 'submit'
    button.textContent = 'Seedで出発'

    const error = document.createElement('span')
    error.id = 'debug-seed-error'
    error.className = 'debug-seed-controls__error'
    error.setAttribute('role', 'alert')

    row.append(input, button)
    this.form.append(label, row, error)
    parent.append(this.form)

    this.form.addEventListener('submit', event => {
      event.preventDefault()
      const seed = parseSeed(input.value)
      if (seed === null) {
        error.textContent = '0〜4294967295の整数を入力してください。'
        input.setAttribute('aria-invalid', 'true')
        input.focus()
        return
      }

      error.textContent = ''
      input.removeAttribute('aria-invalid')
      onStart(seed)
    })
  }

  setVisible(visible: boolean): void {
    this.form.hidden = !visible
  }
}
