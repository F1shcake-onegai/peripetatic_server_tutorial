// Expressive Code plugin: pin placeholders in code blocks.
//   ⟦esp32-c5-devkitc-1.handshake:gpio⟧  →  22
// The placeholder is replaced with the default value and wrapped in
// <span class="pst-pin" data-pin=… data-show=…>, so src/scripts/setup-runtime.js can swap
// in the viewer's value (and update the copy button's text).
import { ExpressiveCodeAnnotation, definePlugin } from '@astrojs/starlight/expressive-code';
import { h } from '@astrojs/starlight/expressive-code/hast';
import { PLACEHOLDER, defaultAssignment, formatPin } from '../src/data/setup/pins.js';

class PinAnnotation extends ExpressiveCodeAnnotation {
  constructor({ signal, show, ...base }) {
    super(base);
    this.signal = signal;
    this.show = show;
  }

  render({ nodesToTransform }) {
    return nodesToTransform.map((node) => h('span.pst-pin', { 'data-pin': this.signal, 'data-show': this.show }, [node]));
  }
}

export function pluginPinPlaceholders() {
  return definePlugin({
    name: 'Pin placeholders',
    hooks: {
      preprocessCode: ({ codeBlock }) => {
        for (const line of codeBlock.getLines()) {
          let match;
          while ((match = PLACEHOLDER.exec(line.text))) {
            const [placeholder, signal, show] = match;
            const value = formatPin(defaultAssignment(signal), show);
            line.editText(match.index, match.index + placeholder.length, value);
            line.addAnnotation(new PinAnnotation({
              signal, show, renderPhase: 'latest',
              inlineRange: { columnStart: match.index, columnEnd: match.index + value.length },
            }));
          }
        }
      },
    },
  });
}
