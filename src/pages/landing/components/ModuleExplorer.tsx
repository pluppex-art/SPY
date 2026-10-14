import { useState } from "react";
import { TabsBar } from "./TabsBar";
import { ProductShot, shotUrl } from "./ProductShot";
import { EXPLORER } from "../content";
import { rv } from "../reveal";

export function ModuleExplorer() {
  const [tabId, setTabId] = useState(EXPLORER[0].id);
  const [itemIdx, setItemIdx] = useState(0);
  const tab = EXPLORER.find((t) => t.id === tabId)!;
  const item = tab.items[itemIdx] ?? tab.items[0];
  const slot = item.slot ?? tab.slot;
  const hasImg = !!shotUrl(slot);

  return (
    <section id="modulos" className="sp-section sp-band" aria-labelledby="sp-mod-title">
      <div className="sp-wrap">
        <h2 id="sp-mod-title" className="sp-h2" {...rv()}>
          Tudo o que a sua operação usa, no mesmo lugar.
        </h2>
        <p className="sp-lede" {...rv(1)}>
          Escolha uma área e veja o que cada módulo entrega. As telas são do S.P.Y. com dados fictícios.
        </p>

        <div {...rv(2)}>
          <TabsBar
            prefix="mod"
            label="Áreas do S.P.Y."
            active={tabId}
            onChange={(id) => {
              setTabId(id);
              setItemIdx(0);
            }}
            items={EXPLORER.map((t) => ({ id: t.id, label: t.label }))}
          />
        </div>

        <div role="tabpanel" id="mod-panel" aria-labelledby={`mod-tab-${tabId}`} className={`sp-mod${hasImg ? "" : " sp-mod--noimg"}`} key={tabId} data-anim="panel">
          <div>
            <p className="sp-mod__intro">{tab.intro}</p>
            <ul className="sp-mod__list">
              {tab.items.map((it, i) => (
                <li key={it.title}>
                  <button type="button" aria-pressed={i === itemIdx} onClick={() => setItemIdx(i)} onMouseEnter={(e) => { if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) setItemIdx(i); }}>
                    <strong>{it.title}</strong>
                    <span>{it.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {hasImg && (
            <div className="sp-mod__shot" key={slot} data-anim="fade">
              <ProductShot slot={slot} alt={`Tela do S.P.Y.: ${item.title}`} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
