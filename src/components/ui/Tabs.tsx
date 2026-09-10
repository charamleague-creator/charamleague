export interface TabItem {
  id: string
  label: string
}

export function Tabs({
  tabs,
  activeId,
  onChange,
}: {
  tabs: TabItem[]
  activeId: string
  onChange: (id: string) => void
}) {
  return (
    <div className="tabs__list" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          className={`tabs__tab${tab.id === activeId ? ' active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
