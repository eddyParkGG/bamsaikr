import { Component, type ReactNode } from 'react'

/** Keeps one failing widget from blanking the whole page */
export class Boundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.error(err)
  }
  render() {
    if (this.state.failed) return this.props.fallback ?? <p className="notice">이 영역을 불러오지 못했어요. 새로고침해 주세요.</p>
    return this.props.children
  }
}
