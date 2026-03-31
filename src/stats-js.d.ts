declare module 'stats.js' {
  type StatsPanel = {
    dom: HTMLCanvasElement
    update(value: number, maxValue: number): void
  }

  export default class Stats {
    REVISION: number
    dom: HTMLDivElement
    domElement: HTMLDivElement

    constructor()

    addPanel(panel: StatsPanel): StatsPanel
    showPanel(id: number): void
    begin(): void
    end(): number
    update(): void
    setMode(id: number): void

    static Panel: new (name: string, fg: string, bg: string) => StatsPanel
  }
}
