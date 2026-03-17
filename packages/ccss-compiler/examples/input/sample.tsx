import { useState } from 'react'

export function SamplePanel() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('home')

  return (
    <main className="ccss-dashboard">
      <input id="ccss:sample:sample-panel:menu-open" type="checkbox" />
      <label htmlFor="ccss:sample:sample-panel:menu-open">open menu</label>
      <section>
        <nav>
          <button data-menu-state="open" onClick={() => setMenuOpen(!menuOpen)}>
            toggle menu
          </button>
          <button data-active-tab={activeTab} onClick={() => setActiveTab('play')}>
            switch tab
          </button>
        </nav>
        <div data-ccss-state="ccss:sample:sample-panel:menu-open">dashboard panel</div>
      </section>
      <canvas id="stage-canvas" />
    </main>
  )
}
