/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EventName, ReactWebComponent, WebComponentProps} from '@lit-labs/react';

import {ReactiveElement} from '@lit/reactive-element';
import {property} from '@lit/reactive-element/decorators/property.js';
import {customElement} from '@lit/reactive-element/decorators/custom-element.js';
import 'react/umd/react.development.js';
import 'react-dom/umd/react-dom.development.js';
import {createComponent} from '@lit-labs/react';
import {assert} from '@esm-bundle/chai';

const DEV_MODE = !!ReactiveElement.enableWarning;

// Needed for JSX expressions
const React = window.React;

declare global {
  interface HTMLElementTagNameMap {
    [tagName]: BasicElement;
    'x-foo': XFoo,
  }

  namespace JSX {
    interface IntrinsicElements {
      "x-foo": WebComponentProps<XFoo>,
    }
  }
}

interface Foo {
  foo?: boolean;
}

@customElement('x-foo')
class XFoo extends ReactiveElement {}

const tagName = 'basic-element';
@customElement(tagName)
class BasicElement extends ReactiveElement {
  @property({type: Boolean})
  bool = false;
  @property({type: String})
  str = '';
  @property({type: Number})
  num = -1;
  @property({type: Object})
  obj: {[index: string]: unknown} | null | undefined = null;
  @property({type: Array})
  arr: unknown[] | null | undefined = null;

  // override a default property
  @property({type: Boolean})
  disabled = false;

  // override a react reserved property
  @property({type: Boolean})
  ref = false;

  // override a react reserved property
  @property({type: String})
  locaName = 'basic-element-x-foo';

  @property({type: Boolean, reflect: true})
  rbool = false;
  @property({type: String, reflect: true})
  rstr = '';
  @property({type: Number, reflect: true})
  rnum = -1;
  @property({type: Object, reflect: true})
  robj: {[index: string]: unknown} | null | undefined = null;
  @property({type: Array, reflect: true})
  rarr: unknown[] | null | undefined = null;

  @property({ type: Object })
  set customAccessors(customAccessors: Foo) {
    const oldValue = this._customAccessors;
    this._customAccessors = customAccessors;
    this.requestUpdate("customAccessors", oldValue);
  }
  get customAccessors(): Foo {
    return this._customAccessors;
  }
  private _customAccessors = {};

  fire(name: string) {
    this.dispatchEvent(new Event(name));
  }
}

let container: HTMLElement;
let el: HTMLDivElement;
let wrappedEl: BasicElement;

const basicElementEvents = {
  onFoo: 'foo' as EventName<MouseEvent>,
  onBar: 'bar',
};

// if some tag, run options
// otherwise
const BasicElementComponent = createComponent({
  react: window.React,
  elementClass: BasicElement,
  events: basicElementEvents,
  tagName,
});

const renderReactComponent = async (
  props?: React.ComponentProps<typeof BasicElementComponent>
) => {
  window.ReactDOM.render(
    <>
      <div {...(props as React.HTMLAttributes<HTMLDivElement>)}/>,
      <x-foo {...props}/>
      <BasicElementComponent {...props}/>,
    </>,
    container
  );

  el = container.querySelector('div')!;
  wrappedEl = container.querySelector(tagName)! as BasicElement;

  await wrappedEl.updateComplete;
};

if (DEV_MODE) {
  suite('Developer mode warnings', () => {
    let warnings: string[] = [];
    const consoleWarn = console.warn;

    suiteSetup(() => {
      console.warn = (message: string) => warnings.push(message);
    });

    suiteTeardown(() => {
      console.warn = consoleWarn;
    });

    setup(() => {
      warnings = [];
    });

    test('warns when react resered properties are used', () => {
      createComponent({
        react: window.React,
        elementClass: BasicElement,
        events: basicElementEvents,
        tagName,
      });

      // We only expect a warning for ref and not localName
      // since we don't warn on overrides of HTMLElement properties
      // that React treats specially.
      assert.equal(warnings.length, 1);
    })
  });
}

suite('createComponent', () => {
  setup(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  teardown(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  /*
    The following test will not build if an incorrect typing occurs
    when events are not provided to `createComponent`.
  */
  test('renders element without optional event map', async () => {
    const ComponentWithoutEventMap = createComponent({
      react: window.React,
      elementClass: BasicElement,
      tagName,
    });

    const name = 'Component without event map.';
    window.ReactDOM.render(
      <ComponentWithoutEventMap>{name}</ComponentWithoutEventMap>,
      container
    );

    const elWithoutMap = container.querySelector(tagName)! as BasicElement;
    await elWithoutMap.updateComplete;

    assert.equal(elWithoutMap.textContent, 'Component without event map.');
  });

  /*
    The following test is a type-only test.
  */
  test('renders element with expected type', async () => {
    type TypedComponent = ReactWebComponent<BasicElement>;

    let TypedBasicElement!: TypedComponent;

    // If this test fails, we can assume types are broken.
    // If this test passes, we can assume types are working
    // because a bool !== 'string'.
    //
    // @ts-expect-error
    <TypedBasicElement bool={"string"}></TypedBasicElement>
  });

  test('works with text children', async () => {
    const name = 'World';
    window.ReactDOM.render(
      <BasicElementComponent>Hello {name}</BasicElementComponent>,
      container
    );

    const elWithChildren = container.querySelector(tagName)! as BasicElement;
    await elWithChildren.updateComplete;

    assert.equal(elWithChildren.textContent, 'Hello World');
  });

  test('has valid displayName', () => {
    assert.equal(BasicElementComponent.displayName, 'BasicElement');

    const NamedComponent = createComponent({
      react: window.React,
      elementClass: BasicElement,
      events: basicElementEvents,
      displayName: 'FooBar',
      tagName,
    });

    assert.equal(NamedComponent.displayName, 'FooBar');
  });

  test('wrapper renders custom element that updates', async () => {
    await renderReactComponent();
    assert.isOk(wrappedEl);
    assert.isOk(wrappedEl.hasUpdated);
  });

  test('can get ref to element', async () => {
    const elementRef1 = window.React.createRef<BasicElement>();
    renderReactComponent({ref: elementRef1});
    assert.equal(elementRef1.current, wrappedEl);
    const elementRef2 = window.React.createRef<BasicElement>();
    renderReactComponent({ref: elementRef2});
    assert.equal(elementRef1.current, null);
    assert.equal(elementRef2.current, wrappedEl);
    renderReactComponent({ref: elementRef1});
    assert.equal(elementRef1.current, wrappedEl);
    assert.equal(elementRef2.current, null);
  });

  test('ref does not create new attribute on element', async () => {
    await renderReactComponent({ref: undefined});

    const outerHTML = wrappedEl?.outerHTML;
    const elementRef1 = window.React.createRef<BasicElement>();
    await renderReactComponent({ref: elementRef1});

    const elAfterRef = container.querySelector(tagName);
    const outerHTMLAfterRef = elAfterRef?.outerHTML;

    assert.equal(outerHTML, outerHTMLAfterRef);
  });

  test('can get ref to element via callbacks', async () => {
    const ref1Calls: Array<string | undefined> = [];
    const refCb1 = (e: Element | null) => ref1Calls.push(e?.localName);
    const ref2Calls: Array<string | undefined> = [];
    const refCb2 = (e: Element | null) => ref2Calls.push(e?.localName);
    renderReactComponent({ref: refCb1});
    assert.deepEqual(ref1Calls, ["div", "x-foo", tagName]);
    renderReactComponent({ref: refCb2});
    assert.deepEqual(ref1Calls, ["div", "x-foo", tagName, undefined, undefined, undefined]);
    assert.deepEqual(ref2Calls, ["div", "x-foo", tagName]);
    renderReactComponent({ref: refCb1});
    assert.deepEqual(ref1Calls, ["div", "x-foo", tagName, undefined, undefined, undefined, "div", "x-foo", tagName]);
    assert.deepEqual(ref2Calls, ["div", "x-foo", tagName, undefined, undefined, undefined]);
  });

  test('can set attributes', async () => {
    await renderReactComponent({});
    assert.equal(el.getAttribute('id'), null);
    assert.equal(el.id, '');
    assert.equal(el.getAttribute('id'), wrappedEl.getAttribute('id'));
    assert.equal(el.id, wrappedEl.id);

    await renderReactComponent({id: 'id'});
    assert.equal(el.getAttribute('id'), 'id');
    assert.equal(el.id, 'id');
    assert.equal(el.getAttribute('id'), wrappedEl.getAttribute('id'));
    assert.equal(el.id, wrappedEl.id);

    await renderReactComponent({id: undefined});
    assert.equal(el.getAttribute('id'), null);
    assert.equal(el.id, '');
    assert.equal(el.getAttribute('id'), wrappedEl.getAttribute('id'));
    assert.equal(el.id, wrappedEl.id);

    await renderReactComponent({id: 'id2'});
    assert.equal(el.getAttribute('id'), 'id2');
    assert.equal(el.id, 'id2');
    assert.equal(el.getAttribute('id'), wrappedEl.getAttribute('id'));
    assert.equal(el.id, wrappedEl.id);

    // @ts-expect-error
    await renderReactComponent({id: null});
    assert.equal(el.getAttribute('id'), null);
    assert.equal(el.id, '');
    assert.equal(el.getAttribute('id'), wrappedEl.getAttribute('id'));
    assert.equal(el.id, wrappedEl.id);

    await renderReactComponent({id: 'id3'});
    assert.equal(el.getAttribute('id'), 'id3');
    assert.equal(el.id, 'id3');
    assert.equal(el.getAttribute('id'), wrappedEl.getAttribute('id'));
    assert.equal(el.id, wrappedEl.id);
  });

  test('sets boolean attributes', async () => {
    await renderReactComponent({});
    assert.equal(el.getAttribute('hidden'), null);
    assert.equal(el.hidden, false);
    assert.equal(el.getAttribute('hidden'), wrappedEl.getAttribute('hidden'));
    assert.equal(el.hidden, wrappedEl.hidden);

    await renderReactComponent({hidden: true});
    assert.equal(wrappedEl.getAttribute('hidden'), '');
    assert.equal(wrappedEl.hidden, true);
    assert.equal(el.getAttribute('hidden'), wrappedEl.getAttribute('hidden'));
    assert.equal(el.hidden, wrappedEl.hidden);

    await renderReactComponent({hidden: false});
    assert.equal(wrappedEl.getAttribute('hidden'), null);
    assert.equal(wrappedEl.hidden, false);
    assert.equal(el.getAttribute('hidden'), wrappedEl.getAttribute('hidden'));
    assert.equal(el.hidden, wrappedEl.hidden);

    await renderReactComponent({hidden: true});
    assert.equal(wrappedEl.getAttribute('hidden'), '');
    assert.equal(wrappedEl.hidden, true);
    assert.equal(el.getAttribute('hidden'), wrappedEl.getAttribute('hidden'));
    assert.equal(el.hidden, wrappedEl.hidden);

    // @ts-expect-error
    await renderReactComponent({hidden: null});
    assert.equal(wrappedEl.getAttribute('hidden'), null);
    assert.equal(wrappedEl.hidden, false);
    assert.equal(el.getAttribute('hidden'), wrappedEl.getAttribute('hidden'));
    assert.equal(el.hidden, wrappedEl.hidden);

    await renderReactComponent({hidden: true});
    assert.equal(wrappedEl.getAttribute('hidden'), '');
    assert.equal(wrappedEl.hidden, true);
    assert.equal(el.getAttribute('hidden'), wrappedEl.getAttribute('hidden'));
    assert.equal(el.hidden, wrappedEl.hidden);

    await renderReactComponent({hidden: undefined});
    assert.equal(el.getAttribute('hidden'), null);
    assert.equal(el.hidden, false);
    assert.equal(el.getAttribute('hidden'), wrappedEl.getAttribute('hidden'));
    assert.equal(el.hidden, wrappedEl.hidden);

    await renderReactComponent({hidden: true});
    assert.equal(wrappedEl.getAttribute('hidden'), '');
    assert.equal(wrappedEl.hidden, true);
    assert.equal(el.getAttribute('hidden'), wrappedEl.getAttribute('hidden'));
    assert.equal(el.hidden, wrappedEl.hidden);
  });

  test('sets enumerated attributes', async () => {
    await renderReactComponent({});
    assert.equal(el.getAttribute('draggable'), null);
    assert.equal(el.draggable, false);
    assert.equal(el.getAttribute('draggable'), wrappedEl.getAttribute('draggable'));
    assert.equal(el.draggable, wrappedEl.draggable);

    await renderReactComponent({draggable: true});
    assert.equal(el.getAttribute('draggable'), 'true');
    assert.equal(el.draggable, true);
    assert.equal(el.getAttribute('draggable'), wrappedEl.getAttribute('draggable'));
    assert.equal(el.draggable, wrappedEl.draggable);

    await renderReactComponent({draggable: false});
    assert.equal(el.getAttribute('draggable'), 'false');
    assert.equal(el.draggable, false);
    assert.equal(el.getAttribute('draggable'), wrappedEl.getAttribute('draggable'));
    assert.equal(el.draggable, wrappedEl.draggable);

    await renderReactComponent({draggable: true});
    assert.equal(el.getAttribute('draggable'), 'true');
    assert.equal(el.draggable, true);
    assert.equal(el.getAttribute('draggable'), wrappedEl.getAttribute('draggable'));
    assert.equal(el.draggable, wrappedEl.draggable);

    // @ts-expect-error
    await renderReactComponent({draggable: null});
    assert.equal(el.getAttribute('draggable'), null);
    assert.equal(el.draggable, false);
    assert.equal(el.getAttribute('draggable'), wrappedEl.getAttribute('draggable'));
    assert.equal(el.draggable, wrappedEl.draggable);

    await renderReactComponent({draggable: true});
    assert.equal(el.getAttribute('draggable'), 'true');
    assert.equal(el.draggable, true);
    assert.equal(el.getAttribute('draggable'), wrappedEl.getAttribute('draggable'));
    assert.equal(el.draggable, wrappedEl.draggable);

    await renderReactComponent({draggable: undefined});
    assert.equal(el.getAttribute('draggable'), null);
    assert.equal(el.draggable, false);
    assert.equal(el.getAttribute('draggable'), wrappedEl.getAttribute('draggable'));
    assert.equal(el.draggable, wrappedEl.draggable);

    await renderReactComponent({draggable: true});
    assert.equal(el.getAttribute('draggable'), 'true');
    assert.equal(el.draggable, true);
    assert.equal(el.getAttribute('draggable'), wrappedEl.getAttribute('draggable'));
    assert.equal(el.draggable, wrappedEl.draggable);
  });

  test('sets boolean aria attributes', async () => {
    await renderReactComponent({});
    assert.equal(el.getAttribute('aria-checked'), null);
    assert.equal(el.getAttribute('aria-checked'), wrappedEl.getAttribute('aria-checked'));

    await renderReactComponent({'aria-checked': true});
    assert.equal(el.getAttribute('aria-checked'), 'true');
    assert.equal(el.getAttribute('aria-checked'), wrappedEl.getAttribute('aria-checked'));

    await renderReactComponent({'aria-checked': false});
    assert.equal(el.getAttribute('aria-checked'), 'false');
    assert.equal(el.getAttribute('aria-checked'), wrappedEl.getAttribute('aria-checked'));

    await renderReactComponent({'aria-checked': true});
    assert.equal(el.getAttribute('aria-checked'), 'true');
    assert.equal(el.getAttribute('aria-checked'), wrappedEl.getAttribute('aria-checked'));

    // @ts-expect-error
    await renderReactComponent({'aria-checked': null});
    assert.equal(el.getAttribute('aria-checked'), null);
    assert.equal(el.getAttribute('aria-checked'), wrappedEl.getAttribute('aria-checked'));

    await renderReactComponent({'aria-checked': true});
    assert.equal(el.getAttribute('aria-checked'), 'true');
    assert.equal(el.getAttribute('aria-checked'), wrappedEl.getAttribute('aria-checked'));

    await renderReactComponent({'aria-checked': undefined});
    assert.equal(el.getAttribute('aria-checked'), null);
    assert.equal(el.getAttribute('aria-checked'), wrappedEl.getAttribute('aria-checked'));

    await renderReactComponent({'aria-checked': true});
    assert.equal(el.getAttribute('aria-checked'), 'true');
    assert.equal(el.getAttribute('aria-checked'), wrappedEl.getAttribute('aria-checked'));
  });

  test('can listen to events', async () => {
    let fooEvent: Event | undefined,
      fooEvent2: Event | undefined,
      barEvent: Event | undefined;
    const onFoo = (e: MouseEvent) => {
      fooEvent = e;
    };
    const onFoo2 = (e: Event) => {
      fooEvent2 = e;
    };
    const onBar = (e: Event) => {
      barEvent = e;
    };
    await renderReactComponent({
      onFoo,
      onBar,
    });
    wrappedEl.fire('foo');
    assert.equal(fooEvent!.type, 'foo');
    wrappedEl.fire('bar');
    assert.equal(barEvent!.type, 'bar');
    fooEvent = undefined;
    barEvent = undefined;
    await renderReactComponent({
      onFoo: undefined,
    });
    wrappedEl.fire('foo');
    assert.equal(fooEvent, undefined);
    wrappedEl.fire('bar');
    assert.equal(barEvent!.type, 'bar');
    fooEvent = undefined;
    barEvent = undefined;
    await renderReactComponent({
      onFoo,
    });
    wrappedEl.fire('foo');
    assert.equal(fooEvent!.type, 'foo');
    wrappedEl.fire('bar');
    assert.equal(barEvent!.type, 'bar');
    await renderReactComponent({
      onFoo: onFoo2,
    });
    fooEvent = undefined;
    fooEvent2 = undefined;
    wrappedEl.fire('foo');
    assert.equal(fooEvent, undefined);
    assert.equal(fooEvent2!.type, 'foo');
    await renderReactComponent({
      onFoo,
    });
    fooEvent = undefined;
    fooEvent2 = undefined;
    wrappedEl.fire('foo');
    assert.equal(fooEvent!.type, 'foo');
    assert.equal(fooEvent2, undefined);
  });

  test('can listen to native events', async () => {
    let clickEvent!: React.MouseEvent;
    await renderReactComponent({
      onClick(e: React.MouseEvent) {
        clickEvent = e;
      },
    });
    wrappedEl.click();
    assert.equal(clickEvent?.type, 'click');
  });

  test('can set children', async () => {
    const children = window.React.createElement(
      'div'
      // Note, constructing children like this is rare and the React type expects
      // this to be an HTMLCollection even though that's not the output of
      // `createElement`.
    );
    await renderReactComponent({children});
    assert.equal(wrappedEl.childNodes.length, 1);
    assert.equal(wrappedEl.firstElementChild!.localName, 'div');
  });

  test('can set reserved React properties', async () => {
    await renderReactComponent({
      style: {display: 'block'},
      className: 'foo bar',
    } as any);
    assert.equal(wrappedEl.style.display, 'block');
    assert.equal(wrappedEl.getAttribute('class'), 'foo bar');
  });
});
