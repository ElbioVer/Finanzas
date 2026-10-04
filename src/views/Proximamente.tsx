export function Proximamente({ title, etapa, items }: { title: string; etapa: number; items: string[] }) {
  return (
    <section>
      <div className="view-head"><div><div className="eyebrow">Etapa {etapa}</div><h1>{title}</h1></div></div>
      <div className="panel soon-box">
        <span className="sample" style={{ alignSelf: 'flex-start' }}>Próximamente</span>
        <p style={{ margin: 0 }}>Esta pantalla se construye en la etapa {etapa}. Va a funcionar así:</p>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(i => <li key={i}>{i}</li>)}
        </ul>
      </div>
    </section>
  );
}
