import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * TimelineLayout — the outer skeleton for the Timeline Execution Stream.
 *
 * Responsibilities (layout only, no business logic):
 *  - Max-width 1120px centred viewport
 *  - Slot for TimelineNodeWrapper children
 */
@customElement("timeline-layout")
export class TimelineLayout extends LitElement {
  override render() {
    return html`
      <div class="tl-viewport">
        <div class="tl-stream">
          <slot></slot>
        </div>
      </div>
    `;
  }

  static override styles = css`
    :host { display: block; width: 100%; min-width: 0; }

    .tl-viewport {
      position: relative;
      max-width: 1120px;
      margin: 0 auto;
      min-height: 0;
    }

    .tl-stream {
      position: relative;
      min-width: 0;
    }
  `;
}
