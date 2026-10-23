import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { NodeKind } from '@orrery/contracts';
import { KIND_STYLES, MARKER_PATHS } from './kind-style';

/** The kind's marker shape in its colour: the same symbol the 3D labels use. */
@Component({
  selector: 'app-kind-marker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0', 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 10 10" [attr.width]="size()" [attr.height]="size()">
      <path [attr.d]="paths().fill" [attr.fill]="color()" />
      @if (paths().stroke; as stroke) {
        <path [attr.d]="stroke" fill="none" [attr.stroke]="color()" stroke-width="1.1" />
      }
    </svg>
  `,
})
export class KindMarker {
  readonly kind = input.required<NodeKind>();
  readonly size = input(10);
  protected readonly color = computed(() => KIND_STYLES[this.kind()].color);
  protected readonly paths = computed(() => MARKER_PATHS[KIND_STYLES[this.kind()].marker]);
}
