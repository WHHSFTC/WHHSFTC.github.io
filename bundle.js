var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function validate_store(store, name) {
        if (!store || typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, callback) {
        const unsub = store.subscribe(callback);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, fn) {
        return definition[1]
            ? assign({}, assign(ctx.$$scope.ctx, definition[1](fn ? fn(ctx) : {})))
            : ctx.$$scope.ctx;
    }
    function get_slot_changes(definition, ctx, changed, fn) {
        return definition[1]
            ? assign({}, assign(ctx.$$scope.changed || {}, definition[1](fn ? fn(changed) : {})))
            : ctx.$$scope.changed || {};
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }
    const has_prop = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? undefined : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function select_option(select, value) {
        for (let i = 0; i < select.options.length; i += 1) {
            const option = select.options[i];
            if (option.__value === value) {
                option.selected = true;
                return;
            }
        }
    }
    function select_value(select) {
        const selected_option = select.querySelector(':checked') || select.options[0];
        return selected_option && selected_option.__value;
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update($$.dirty);
            run_all($$.before_update);
            $$.fragment && $$.fragment.p($$.dirty, $$.ctx);
            $$.dirty = null;
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    const globals = (typeof window !== 'undefined' ? window : global);

    function bind(component, name, callback) {
        if (has_prop(component.$$.props, name)) {
            name = component.$$.props[name] || name;
            component.$$.bound[name] = callback;
            callback(component.$$.ctx[name]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = {};
        }
    }
    function make_dirty(component, key) {
        if (!component.$$.dirty) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty = blank_object();
        }
        component.$$.dirty[key] = true;
    }
    function init(component, options, instance, create_fragment, not_equal, props) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty: null
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (key, ret, value = ret) => {
                if ($$.ctx && not_equal($$.ctx[key], $$.ctx[key] = value)) {
                    if ($$.bound[key])
                        $$.bound[key](value);
                    if (ready)
                        make_dirty(component, key);
                }
                return ret;
            })
            : prop_values;
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, detail));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev("SvelteDOMSetProperty", { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    function wrapIDBRequest(request) {
        return new Promise((resolve, reject) => {
    	request.onsuccess = () => resolve(request.result);
    	request.onerror = () => reject(request.error);
        })
    }

    async function IDBList(request, storeName) {
        request.onupgradeneeded = () => {
    	const db = request.result;
    	if (!db.objectStoreNames.contains(storeName)) {
    	    db.createObjectStore(storeName, {keyPath: 'index'});
    	}
        };
        
        const db = await wrapIDBRequest(request);

        function getAll() {
    	const request = db.transaction(storeName).objectStore(storeName).getAll();
    	return wrapIDBRequest(request)
        }

        function push(value) {
    	const request = db.transaction(storeName, 'readwrite').objectStore(storeName).add(value);
    	return wrapIDBRequest(request)
        }

        function remove(index) {
    	const request = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(index);
    	return wrapIDBRequest(request)
        }

        function set(index, value) {
    	const request = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value);
    	return wrapIDBRequest(request)
        }

        return { getAll, push, remove, set }
    }

    const view = writable('overview');
    async function pagesStore() {
        // Set up DB
        const request = indexedDB.open('scoutapp', 1);
        const list = await IDBList(request, 'pages');

        // Set up values
        let value = (await list.getAll()).sort((a, b) => a.index > b.index);
        let index = value.length > 0 ? value[value.length - 1].index : 0;

        // Subscriptions
        let subscribers = new Map();
        let subscriberIndex = 0;
        
        function subscribe(fn) {
    	fn(value);
    	const key = subscribers.set(subscriberIndex, fn);
    	return () => {
    	    subscribers.delete(key);
    	}
        }

        function update() {
    	for (const [key, subscriber] of subscribers) {
    	    subscriber(value);
    	}
        }

        // Modifying
        function push(newVal) { // Adds to end
    	newVal.index = ++index;
    	newVal.key = Date.now().toString(36) + Math.random().toString(36).substring(2);
    	list.push(newVal);
    	value.push(newVal);
    	update();
        }

        function remove(index) {
    	list.remove(index);
    	const [val] = value.splice(value.findIndex(el => el.index === index), 1);
    	update();
    	return val
        }

        function set(index, newVal) {
    	list.set(index, newVal);
    	value[value.findIndex(el => el.index === index)] = newVal;
    	update();
        }

        function merge(newVal) {
    	const oldIndex = value.findIndex(el => el.key === newVal.key);
    	if (oldIndex != -1) {
    	    list.set(value[oldIndex].index, newVal);
    	    value[oldIndex] = newVal;
    	} else {
    	    push(newVal);
    	}
    	update();
        }

        return { subscribe, push, remove, set, merge }
    }

    const pagesStoreAsync = pagesStore();

    const schema = {
        'Match': {
    	'red 1': 'number',
    	'red 2': 'number',
    	'blue 1': 'number',
    	'blue 2': 'number',
    	'team': ['red 1', 'red 2', 'blue 1', 'blue 2'].map(field => dbField('Match', field))
        },
        'Auto': {
    	'stones delivered': 'incDec',
    	'skystones delivered': 'incDec',
    	'stones placed': 'incDec',
    	'foundation moved': 'toggle',
    	'navigated': 'toggle',
        },
        'Tele': {
    	'stones delivered': 'incDec',
    	'stone placed': 'incDec',
        },
        'Endgame': {
    	'capstone': 'toggle',
    	'foundation moved': 'toggle',
    	'parked': 'toggle',
    	'skyscraper height': 'incDec'
        }
    };

    function capitalize(string) {
        return string[0].toUpperCase() + string.substring(1)
    }

    function dbField(category, field) {
        return category + field.split(' ')
    			   .map(capitalize)
    			   .join('')
    }

    function defaultValue(type) {
        if (typeof type === 'object') {
    	return type[0]
        }
        switch(type) {
    	case 'number':
    	    return ''
    	case 'incDec':
    	    return 0
    	case 'toggle':
    	    return false
        }
    }

    let defaults = {};
    for (const category in schema) {
        for (const field in schema[category]) {
    	const fieldName = dbField(category, field);
    	defaults[fieldName] = defaultValue(schema[category][field]);
        }
    }

    const defaultValues = Object.freeze(defaults);
    //export const [matchFields, autoFields, teleFields, endFields] = ['a', 'b', 'c', 'd']
    const matchFields= Object.keys(schema.Match).map(key => ({field: dbField('Match', key), type: schema.Match[key], label: capitalize(key)}));
    const autoFields = Object.keys(schema.Auto).map(key => ({field: dbField('Auto', key), type: schema.Auto[key], label: capitalize(key)}));
    const teleFields = Object.keys(schema.Tele).map(key => ({field: dbField('Tele', key), type: schema.Tele[key], label: capitalize(key)}));
    const endFields= Object.keys(schema.Endgame).map(key => ({field: dbField('Endgame', key), type: schema.Endgame[key], label: capitalize(key)}));

    /* src/Components/Button.svelte generated by Svelte v3.15.0 */

    const file = "src/Components/Button.svelte";

    function create_fragment(ctx) {
    	let div;
    	let current;
    	let dispose;
    	const default_slot_template = ctx.$$slots.default;
    	const default_slot = create_slot(default_slot_template, ctx, null);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			attr_dev(div, "class", "svelte-3jlzdz");
    			add_location(div, file, 0, 0, 0);
    			dispose = listen_dev(div, "click", ctx.click_handler, false, false, false);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p: function update(changed, ctx) {
    			if (default_slot && default_slot.p && changed.$$scope) {
    				default_slot.p(get_slot_changes(default_slot_template, ctx, changed, null), get_slot_context(default_slot_template, ctx, null));
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (default_slot) default_slot.d(detaching);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots = {}, $$scope } = $$props;

    	function click_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ("$$scope" in $$props) $$invalidate("$$scope", $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		
    	};

    	return { click_handler, $$slots, $$scope };
    }

    class Button extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Button",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    /* src/OverviewTab.svelte generated by Svelte v3.15.0 */

    const file$1 = "src/OverviewTab.svelte";

    // (12:0) {:else}
    function create_else_block_1(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("_");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_1.name,
    		type: "else",
    		source: "(12:0) {:else}",
    		ctx
    	});

    	return block;
    }

    // (6:0) {#if page[team]}
    function create_if_block(ctx) {
    	let if_block_anchor;

    	function select_block_type_1(changed, ctx) {
    		if (ctx.page.MatchTeam === ctx.team) return create_if_block_1;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type_1(null, ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(changed, ctx) {
    			if (current_block_type === (current_block_type = select_block_type_1(changed, ctx)) && if_block) {
    				if_block.p(changed, ctx);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		d: function destroy(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(6:0) {#if page[team]}",
    		ctx
    	});

    	return block;
    }

    // (9:4) {:else}
    function create_else_block(ctx) {
    	let t_value = ctx.page[ctx.team] + "";
    	let t;

    	const block = {
    		c: function create() {
    			t = text(t_value);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(changed, ctx) {
    			if ((changed.page || changed.team) && t_value !== (t_value = ctx.page[ctx.team] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(9:4) {:else}",
    		ctx
    	});

    	return block;
    }

    // (7:4) {#if page.MatchTeam === team}
    function create_if_block_1(ctx) {
    	let strong;
    	let t_value = ctx.page[ctx.team] + "";
    	let t;

    	const block = {
    		c: function create() {
    			strong = element("strong");
    			t = text(t_value);
    			add_location(strong, file$1, 7, 1, 106);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, strong, anchor);
    			append_dev(strong, t);
    		},
    		p: function update(changed, ctx) {
    			if ((changed.page || changed.team) && t_value !== (t_value = ctx.page[ctx.team] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(strong);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(7:4) {#if page.MatchTeam === team}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let if_block_anchor;

    	function select_block_type(changed, ctx) {
    		if (ctx.page[ctx.team]) return create_if_block;
    		return create_else_block_1;
    	}

    	let current_block_type = select_block_type(null, ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(changed, ctx) {
    			if (current_block_type === (current_block_type = select_block_type(changed, ctx)) && if_block) {
    				if_block.p(changed, ctx);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { page } = $$props;
    	let { team } = $$props;
    	const writable_props = ["page", "team"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<OverviewTab> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("page" in $$props) $$invalidate("page", page = $$props.page);
    		if ("team" in $$props) $$invalidate("team", team = $$props.team);
    	};

    	$$self.$capture_state = () => {
    		return { page, team };
    	};

    	$$self.$inject_state = $$props => {
    		if ("page" in $$props) $$invalidate("page", page = $$props.page);
    		if ("team" in $$props) $$invalidate("team", team = $$props.team);
    	};

    	return { page, team };
    }

    class OverviewTab extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { page: 0, team: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "OverviewTab",
    			options,
    			id: create_fragment$1.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (ctx.page === undefined && !("page" in props)) {
    			console.warn("<OverviewTab> was created without expected prop 'page'");
    		}

    		if (ctx.team === undefined && !("team" in props)) {
    			console.warn("<OverviewTab> was created without expected prop 'team'");
    		}
    	}

    	get page() {
    		throw new Error("<OverviewTab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set page(value) {
    		throw new Error("<OverviewTab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get team() {
    		throw new Error("<OverviewTab>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set team(value) {
    		throw new Error("<OverviewTab>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/Overview.svelte generated by Svelte v3.15.0 */

    const { Object: Object_1 } = globals;
    const file$2 = "src/Overview.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.page = list[i];
    	child_ctx.i = i;
    	return child_ctx;
    }

    // (59:25) <Button on:click={newPage}>
    function create_default_slot_4(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("New Page");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_4.name,
    		type: "slot",
    		source: "(59:25) <Button on:click={newPage}>",
    		ctx
    	});

    	return block;
    }

    // (60:25) <Button on:click={manage}>
    function create_default_slot_3(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Manage");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_3.name,
    		type: "slot",
    		source: "(60:25) <Button on:click={manage}>",
    		ctx
    	});

    	return block;
    }

    // (61:25) <Button on:click={analyze}>
    function create_default_slot_2(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Analyze");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2.name,
    		type: "slot",
    		source: "(61:25) <Button on:click={analyze}>",
    		ctx
    	});

    	return block;
    }

    // (81:5) {:else}
    function create_else_block$1(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Loading");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(81:5) {:else}",
    		ctx
    	});

    	return block;
    }

    // (63:4) {#if pagesValue}
    function create_if_block$1(ctx) {
    	let div;
    	let current;
    	let each_value = ctx.pagesValue;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div, "class", "pages svelte-1tu6pzb");
    			add_location(div, file$2, 63, 1, 1422);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			current = true;
    		},
    		p: function update(changed, ctx) {
    			if (changed.deletePage || changed.pagesValue || changed.switchToPage) {
    				each_value = ctx.pagesValue;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(div, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(63:4) {#if pagesValue}",
    		ctx
    	});

    	return block;
    }

    // (67:6) <Button on:click={() => switchToPage(page.index, i)}>
    function create_default_slot_1(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let current;

    	const overviewtab0 = new OverviewTab({
    			props: { page: ctx.page, team: "MatchRed1" },
    			$$inline: true
    		});

    	const overviewtab1 = new OverviewTab({
    			props: { page: ctx.page, team: "MatchRed2" },
    			$$inline: true
    		});

    	const overviewtab2 = new OverviewTab({
    			props: { page: ctx.page, team: "MatchBlue1" },
    			$$inline: true
    		});

    	const overviewtab3 = new OverviewTab({
    			props: { page: ctx.page, team: "MatchBlue2" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(overviewtab0.$$.fragment);
    			t0 = text(" &\n\t\t\t");
    			create_component(overviewtab1.$$.fragment);
    			t1 = text(" vs\n\t\t\t");
    			create_component(overviewtab2.$$.fragment);
    			t2 = text(" &\n\t\t\t");
    			create_component(overviewtab3.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(overviewtab0, target, anchor);
    			insert_dev(target, t0, anchor);
    			mount_component(overviewtab1, target, anchor);
    			insert_dev(target, t1, anchor);
    			mount_component(overviewtab2, target, anchor);
    			insert_dev(target, t2, anchor);
    			mount_component(overviewtab3, target, anchor);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			const overviewtab0_changes = {};
    			if (changed.pagesValue) overviewtab0_changes.page = ctx.page;
    			overviewtab0.$set(overviewtab0_changes);
    			const overviewtab1_changes = {};
    			if (changed.pagesValue) overviewtab1_changes.page = ctx.page;
    			overviewtab1.$set(overviewtab1_changes);
    			const overviewtab2_changes = {};
    			if (changed.pagesValue) overviewtab2_changes.page = ctx.page;
    			overviewtab2.$set(overviewtab2_changes);
    			const overviewtab3_changes = {};
    			if (changed.pagesValue) overviewtab3_changes.page = ctx.page;
    			overviewtab3.$set(overviewtab3_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(overviewtab0.$$.fragment, local);
    			transition_in(overviewtab1.$$.fragment, local);
    			transition_in(overviewtab2.$$.fragment, local);
    			transition_in(overviewtab3.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(overviewtab0.$$.fragment, local);
    			transition_out(overviewtab1.$$.fragment, local);
    			transition_out(overviewtab2.$$.fragment, local);
    			transition_out(overviewtab3.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(overviewtab0, detaching);
    			if (detaching) detach_dev(t0);
    			destroy_component(overviewtab1, detaching);
    			if (detaching) detach_dev(t1);
    			destroy_component(overviewtab2, detaching);
    			if (detaching) detach_dev(t2);
    			destroy_component(overviewtab3, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1.name,
    		type: "slot",
    		source: "(67:6) <Button on:click={() => switchToPage(page.index, i)}>",
    		ctx
    	});

    	return block;
    }

    // (74:3) <Button on:click={() => deletePage(page.index)}>
    function create_default_slot(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Delete");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(74:3) <Button on:click={() => deletePage(page.index)}>",
    		ctx
    	});

    	return block;
    }

    // (65:5) {#each pagesValue as page, i}
    function create_each_block(ctx) {
    	let div1;
    	let t0;
    	let div0;
    	let t1;
    	let current;

    	function click_handler(...args) {
    		return ctx.click_handler(ctx, ...args);
    	}

    	const button0 = new Button({
    			props: {
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button0.$on("click", click_handler);

    	function click_handler_1(...args) {
    		return ctx.click_handler_1(ctx, ...args);
    	}

    	const button1 = new Button({
    			props: {
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button1.$on("click", click_handler_1);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			create_component(button0.$$.fragment);
    			t0 = space();
    			div0 = element("div");
    			create_component(button1.$$.fragment);
    			t1 = space();
    			attr_dev(div0, "class", "delete svelte-1tu6pzb");
    			add_location(div0, file$2, 72, 6, 1781);
    			attr_dev(div1, "class", "page svelte-1tu6pzb");
    			add_location(div1, file$2, 65, 2, 1479);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			mount_component(button0, div1, null);
    			append_dev(div1, t0);
    			append_dev(div1, div0);
    			mount_component(button1, div0, null);
    			append_dev(div1, t1);
    			current = true;
    		},
    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			const button0_changes = {};

    			if (changed.$$scope || changed.pagesValue) {
    				button0_changes.$$scope = { changed, ctx };
    			}

    			button0.$set(button0_changes);
    			const button1_changes = {};

    			if (changed.$$scope) {
    				button1_changes.$$scope = { changed, ctx };
    			}

    			button1.$set(button1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(button0.$$.fragment, local);
    			transition_in(button1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(button0.$$.fragment, local);
    			transition_out(button1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_component(button0);
    			destroy_component(button1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(65:5) {#each pagesValue as page, i}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let div4;
    	let div3;
    	let div0;
    	let t0;
    	let div1;
    	let t1;
    	let div2;
    	let t2;
    	let current_block_type_index;
    	let if_block;
    	let current;

    	const button0 = new Button({
    			props: {
    				$$slots: { default: [create_default_slot_4] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button0.$on("click", ctx.newPage);

    	const button1 = new Button({
    			props: {
    				$$slots: { default: [create_default_slot_3] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button1.$on("click", manage);

    	const button2 = new Button({
    			props: {
    				$$slots: { default: [create_default_slot_2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button2.$on("click", analyze);
    	const if_block_creators = [create_if_block$1, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(changed, ctx) {
    		if (ctx.pagesValue) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(null, ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div4 = element("div");
    			div3 = element("div");
    			div0 = element("div");
    			create_component(button0.$$.fragment);
    			t0 = space();
    			div1 = element("div");
    			create_component(button1.$$.fragment);
    			t1 = space();
    			div2 = element("div");
    			create_component(button2.$$.fragment);
    			t2 = space();
    			if_block.c();
    			attr_dev(div0, "class", "navigation svelte-1tu6pzb");
    			add_location(div0, file$2, 58, 1, 1166);
    			attr_dev(div1, "class", "navigation svelte-1tu6pzb");
    			add_location(div1, file$2, 59, 1, 1242);
    			attr_dev(div2, "class", "navigation svelte-1tu6pzb");
    			add_location(div2, file$2, 60, 1, 1315);
    			attr_dev(div3, "class", "navigationContainer svelte-1tu6pzb");
    			add_location(div3, file$2, 57, 4, 1131);
    			attr_dev(div4, "class", "container svelte-1tu6pzb");
    			add_location(div4, file$2, 56, 0, 1103);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div4, anchor);
    			append_dev(div4, div3);
    			append_dev(div3, div0);
    			mount_component(button0, div0, null);
    			append_dev(div3, t0);
    			append_dev(div3, div1);
    			mount_component(button1, div1, null);
    			append_dev(div3, t1);
    			append_dev(div3, div2);
    			mount_component(button2, div2, null);
    			append_dev(div4, t2);
    			if_blocks[current_block_type_index].m(div4, null);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			const button0_changes = {};

    			if (changed.$$scope) {
    				button0_changes.$$scope = { changed, ctx };
    			}

    			button0.$set(button0_changes);
    			const button1_changes = {};

    			if (changed.$$scope) {
    				button1_changes.$$scope = { changed, ctx };
    			}

    			button1.$set(button1_changes);
    			const button2_changes = {};

    			if (changed.$$scope) {
    				button2_changes.$$scope = { changed, ctx };
    			}

    			button2.$set(button2_changes);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(changed, ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(changed, ctx);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(div4, null);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(button0.$$.fragment, local);
    			transition_in(button1.$$.fragment, local);
    			transition_in(button2.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(button0.$$.fragment, local);
    			transition_out(button1.$$.fragment, local);
    			transition_out(button2.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div4);
    			destroy_component(button0);
    			destroy_component(button1);
    			destroy_component(button2);
    			if_blocks[current_block_type_index].d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function manage() {
    	view.set("manage");
    }

    function analyze() {
    	view.set("analysis");
    }

    function pageView() {
    	view.set("scout");
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let pagesValue;
    	let pagesStore;
    	let unsubscribe;

    	pagesStoreAsync.then(store => {
    		pagesStore = store;
    		unsubscribe = pagesStore.subscribe(val => $$invalidate("pagesValue", pagesValue = val));
    	});

    	onDestroy(() => {
    		if (unsubscribe) {
    			unsubscribe();
    		}
    	});

    	function newPage() {
    		pagesStore.push(Object.assign({}, defaultValues));
    		pageView();
    	}

    	function deletePage(index) {
    		if (confirm("Delete?")) {
    			pagesStore.remove(index);
    		}
    	}

    	function switchToPage(pageIndex, renderIndex) {
    		if (renderIndex < pagesValue.length - 1) {
    			const removedPage = pagesStore.remove(pageIndex);
    			pagesStore.push(removedPage);
    		}

    		pageView();
    	}

    	const click_handler = ({ page, i }) => switchToPage(page.index, i);
    	const click_handler_1 = ({ page }) => deletePage(page.index);

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("pagesValue" in $$props) $$invalidate("pagesValue", pagesValue = $$props.pagesValue);
    		if ("pagesStore" in $$props) pagesStore = $$props.pagesStore;
    		if ("unsubscribe" in $$props) unsubscribe = $$props.unsubscribe;
    	};

    	return {
    		pagesValue,
    		newPage,
    		deletePage,
    		switchToPage,
    		click_handler,
    		click_handler_1
    	};
    }

    class Overview extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Overview",
    			options,
    			id: create_fragment$2.name
    		});
    	}
    }

    /* src/Inputs/CheckboxInput.svelte generated by Svelte v3.15.0 */

    const file$3 = "src/Inputs/CheckboxInput.svelte";

    function create_fragment$3(ctx) {
    	let div1;
    	let t0;
    	let t1;
    	let div0;
    	let div0_class_value;
    	let dispose;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			t0 = text(ctx.label);
    			t1 = space();
    			div0 = element("div");
    			attr_dev(div0, "class", div0_class_value = "" + (null_to_empty(ctx.checked ? "checked" : "checkbox") + " svelte-1ocegrm"));
    			attr_dev(div0, "tabindex", "0");
    			add_location(div0, file$3, 12, 4, 170);
    			attr_dev(div1, "class", "container svelte-1ocegrm");
    			add_location(div1, file$3, 9, 0, 107);
    			dispose = listen_dev(div1, "click", ctx.toggle, false, false, false);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, t0);
    			append_dev(div1, t1);
    			append_dev(div1, div0);
    		},
    		p: function update(changed, ctx) {
    			if (changed.label) set_data_dev(t0, ctx.label);

    			if (changed.checked && div0_class_value !== (div0_class_value = "" + (null_to_empty(ctx.checked ? "checked" : "checkbox") + " svelte-1ocegrm"))) {
    				attr_dev(div0, "class", div0_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { checked } = $$props;
    	let { label } = $$props;

    	function toggle() {
    		$$invalidate("checked", checked = !checked);
    	}

    	const writable_props = ["checked", "label"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<CheckboxInput> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("checked" in $$props) $$invalidate("checked", checked = $$props.checked);
    		if ("label" in $$props) $$invalidate("label", label = $$props.label);
    	};

    	$$self.$capture_state = () => {
    		return { checked, label };
    	};

    	$$self.$inject_state = $$props => {
    		if ("checked" in $$props) $$invalidate("checked", checked = $$props.checked);
    		if ("label" in $$props) $$invalidate("label", label = $$props.label);
    	};

    	return { checked, label, toggle };
    }

    class CheckboxInput extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { checked: 0, label: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "CheckboxInput",
    			options,
    			id: create_fragment$3.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (ctx.checked === undefined && !("checked" in props)) {
    			console.warn("<CheckboxInput> was created without expected prop 'checked'");
    		}

    		if (ctx.label === undefined && !("label" in props)) {
    			console.warn("<CheckboxInput> was created without expected prop 'label'");
    		}
    	}

    	get checked() {
    		throw new Error("<CheckboxInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set checked(value) {
    		throw new Error("<CheckboxInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get label() {
    		throw new Error("<CheckboxInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<CheckboxInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/Inputs/NumberInput.svelte generated by Svelte v3.15.0 */

    const file$4 = "src/Inputs/NumberInput.svelte";

    function create_fragment$4(ctx) {
    	let input;
    	let input_updating = false;
    	let dispose;

    	function input_input_handler() {
    		input_updating = true;
    		ctx.input_input_handler.call(input);
    	}

    	const block = {
    		c: function create() {
    			input = element("input");
    			attr_dev(input, "type", "number");
    			attr_dev(input, "class", "svelte-vynvz7");
    			add_location(input, file$4, 4, 0, 38);
    			dispose = listen_dev(input, "input", input_input_handler);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input, anchor);
    			set_input_value(input, ctx.value);
    		},
    		p: function update(changed, ctx) {
    			if (!input_updating && changed.value) {
    				set_input_value(input, ctx.value);
    			}

    			input_updating = false;
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { value } = $$props;
    	const writable_props = ["value"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<NumberInput> was created with unknown prop '${key}'`);
    	});

    	function input_input_handler() {
    		value = to_number(this.value);
    		$$invalidate("value", value);
    	}

    	$$self.$set = $$props => {
    		if ("value" in $$props) $$invalidate("value", value = $$props.value);
    	};

    	$$self.$capture_state = () => {
    		return { value };
    	};

    	$$self.$inject_state = $$props => {
    		if ("value" in $$props) $$invalidate("value", value = $$props.value);
    	};

    	return { value, input_input_handler };
    }

    class NumberInput extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { value: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "NumberInput",
    			options,
    			id: create_fragment$4.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (ctx.value === undefined && !("value" in props)) {
    			console.warn("<NumberInput> was created without expected prop 'value'");
    		}
    	}

    	get value() {
    		throw new Error("<NumberInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<NumberInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/Inputs/IncDecInput.svelte generated by Svelte v3.15.0 */
    const file$5 = "src/Inputs/IncDecInput.svelte";

    // (13:4) <Button on:click={decrement}>
    function create_default_slot_1$1(ctx) {
    	let span;

    	const block = {
    		c: function create() {
    			span = element("span");
    			span.textContent = "-";
    			attr_dev(span, "class", "svelte-1cwtu9x");
    			add_location(span, file$5, 12, 33, 264);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1$1.name,
    		type: "slot",
    		source: "(13:4) <Button on:click={decrement}>",
    		ctx
    	});

    	return block;
    }

    // (17:4) <Button on:click={increment}>
    function create_default_slot$1(ctx) {
    	let span;

    	const block = {
    		c: function create() {
    			span = element("span");
    			span.textContent = "+";
    			attr_dev(span, "class", "svelte-1cwtu9x");
    			add_location(span, file$5, 16, 33, 392);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$1.name,
    		type: "slot",
    		source: "(17:4) <Button on:click={increment}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let div1;
    	let t0;
    	let div0;
    	let updating_value;
    	let t1;
    	let current;

    	const button0 = new Button({
    			props: {
    				$$slots: { default: [create_default_slot_1$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button0.$on("click", ctx.decrement);

    	function numberinput_value_binding(value_1) {
    		ctx.numberinput_value_binding.call(null, value_1);
    	}

    	let numberinput_props = {};

    	if (ctx.value !== void 0) {
    		numberinput_props.value = ctx.value;
    	}

    	const numberinput = new NumberInput({ props: numberinput_props, $$inline: true });
    	binding_callbacks.push(() => bind(numberinput, "value", numberinput_value_binding));

    	const button1 = new Button({
    			props: {
    				$$slots: { default: [create_default_slot$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button1.$on("click", ctx.increment);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			create_component(button0.$$.fragment);
    			t0 = space();
    			div0 = element("div");
    			create_component(numberinput.$$.fragment);
    			t1 = space();
    			create_component(button1.$$.fragment);
    			attr_dev(div0, "class", "padded svelte-1cwtu9x");
    			add_location(div0, file$5, 13, 4, 292);
    			attr_dev(div1, "class", "container svelte-1cwtu9x");
    			add_location(div1, file$5, 11, 0, 207);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			mount_component(button0, div1, null);
    			append_dev(div1, t0);
    			append_dev(div1, div0);
    			mount_component(numberinput, div0, null);
    			append_dev(div1, t1);
    			mount_component(button1, div1, null);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			const button0_changes = {};

    			if (changed.$$scope) {
    				button0_changes.$$scope = { changed, ctx };
    			}

    			button0.$set(button0_changes);
    			const numberinput_changes = {};

    			if (!updating_value && changed.value) {
    				updating_value = true;
    				numberinput_changes.value = ctx.value;
    				add_flush_callback(() => updating_value = false);
    			}

    			numberinput.$set(numberinput_changes);
    			const button1_changes = {};

    			if (changed.$$scope) {
    				button1_changes.$$scope = { changed, ctx };
    			}

    			button1.$set(button1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(button0.$$.fragment, local);
    			transition_in(numberinput.$$.fragment, local);
    			transition_in(button1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(button0.$$.fragment, local);
    			transition_out(numberinput.$$.fragment, local);
    			transition_out(button1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_component(button0);
    			destroy_component(numberinput);
    			destroy_component(button1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { value } = $$props;

    	function increment() {
    		$$invalidate("value", value++, value);
    	}

    	function decrement() {
    		$$invalidate("value", value--, value);
    	}

    	const writable_props = ["value"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<IncDecInput> was created with unknown prop '${key}'`);
    	});

    	function numberinput_value_binding(value_1) {
    		value = value_1;
    		$$invalidate("value", value);
    	}

    	$$self.$set = $$props => {
    		if ("value" in $$props) $$invalidate("value", value = $$props.value);
    	};

    	$$self.$capture_state = () => {
    		return { value };
    	};

    	$$self.$inject_state = $$props => {
    		if ("value" in $$props) $$invalidate("value", value = $$props.value);
    	};

    	return {
    		value,
    		increment,
    		decrement,
    		numberinput_value_binding
    	};
    }

    class IncDecInput extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { value: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "IncDecInput",
    			options,
    			id: create_fragment$5.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (ctx.value === undefined && !("value" in props)) {
    			console.warn("<IncDecInput> was created without expected prop 'value'");
    		}
    	}

    	get value() {
    		throw new Error("<IncDecInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<IncDecInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/Inputs/SelectInput.svelte generated by Svelte v3.15.0 */

    const file$6 = "src/Inputs/SelectInput.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.option = list[i];
    	return child_ctx;
    }

    // (7:4) {#each options as option}
    function create_each_block$1(ctx) {
    	let option;
    	let t0_value = ctx.option.name + "";
    	let t0;
    	let t1;
    	let option_value_value;

    	const block = {
    		c: function create() {
    			option = element("option");
    			t0 = text(t0_value);
    			t1 = space();
    			option.__value = option_value_value = ctx.option.option;
    			option.value = option.__value;
    			add_location(option, file$6, 7, 1, 123);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, option, anchor);
    			append_dev(option, t0);
    			append_dev(option, t1);
    		},
    		p: function update(changed, ctx) {
    			if (changed.options && t0_value !== (t0_value = ctx.option.name + "")) set_data_dev(t0, t0_value);

    			if (changed.options && option_value_value !== (option_value_value = ctx.option.option)) {
    				prop_dev(option, "__value", option_value_value);
    			}

    			option.value = option.__value;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(option);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(7:4) {#each options as option}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let select;
    	let dispose;
    	let each_value = ctx.options;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			select = element("select");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(select, "class", "svelte-q2dnlp");
    			if (ctx.selected === void 0) add_render_callback(() => ctx.select_change_handler.call(select));
    			add_location(select, file$6, 5, 0, 61);
    			dispose = listen_dev(select, "change", ctx.select_change_handler);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, select, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select, null);
    			}

    			select_option(select, ctx.selected);
    		},
    		p: function update(changed, ctx) {
    			if (changed.options) {
    				each_value = ctx.options;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (changed.selected) {
    				select_option(select, ctx.selected);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(select);
    			destroy_each(each_blocks, detaching);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { options } = $$props;
    	let { selected } = $$props;
    	const writable_props = ["options", "selected"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<SelectInput> was created with unknown prop '${key}'`);
    	});

    	function select_change_handler() {
    		selected = select_value(this);
    		$$invalidate("selected", selected);
    		$$invalidate("options", options);
    	}

    	$$self.$set = $$props => {
    		if ("options" in $$props) $$invalidate("options", options = $$props.options);
    		if ("selected" in $$props) $$invalidate("selected", selected = $$props.selected);
    	};

    	$$self.$capture_state = () => {
    		return { options, selected };
    	};

    	$$self.$inject_state = $$props => {
    		if ("options" in $$props) $$invalidate("options", options = $$props.options);
    		if ("selected" in $$props) $$invalidate("selected", selected = $$props.selected);
    	};

    	return { options, selected, select_change_handler };
    }

    class SelectInput extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { options: 0, selected: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "SelectInput",
    			options,
    			id: create_fragment$6.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (ctx.options === undefined && !("options" in props)) {
    			console.warn("<SelectInput> was created without expected prop 'options'");
    		}

    		if (ctx.selected === undefined && !("selected" in props)) {
    			console.warn("<SelectInput> was created without expected prop 'selected'");
    		}
    	}

    	get options() {
    		throw new Error("<SelectInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set options(value) {
    		throw new Error("<SelectInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selected() {
    		throw new Error("<SelectInput>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selected(value) {
    		throw new Error("<SelectInput>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/Inputs/InputFields.svelte generated by Svelte v3.15.0 */
    const file$7 = "src/Inputs/InputFields.svelte";

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.label = list[i].label;
    	child_ctx.field = list[i].field;
    	child_ctx.type = list[i].type;
    	return child_ctx;
    }

    // (13:1) {#if type !== 'toggle'}
    function create_if_block_4(ctx) {
    	let div;
    	let t_value = ctx.label + "";
    	let t;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t = text(t_value);
    			attr_dev(div, "class", "label svelte-1enhrwl");
    			add_location(div, file$7, 13, 5, 348);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, t);
    		},
    		p: function update(changed, ctx) {
    			if (changed.fields && t_value !== (t_value = ctx.label + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(13:1) {#if type !== 'toggle'}",
    		ctx
    	});

    	return block;
    }

    // (23:36) 
    function create_if_block_3(ctx) {
    	let updating_selected;
    	let current;

    	function selectinput_selected_binding(value) {
    		ctx.selectinput_selected_binding.call(null, value, ctx);
    	}

    	let selectinput_props = { options: ctx.type.map(ctx.func) };

    	if (ctx.values[ctx.field] !== void 0) {
    		selectinput_props.selected = ctx.values[ctx.field];
    	}

    	const selectinput = new SelectInput({ props: selectinput_props, $$inline: true });
    	binding_callbacks.push(() => bind(selectinput, "selected", selectinput_selected_binding));

    	const block = {
    		c: function create() {
    			create_component(selectinput.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(selectinput, target, anchor);
    			current = true;
    		},
    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			const selectinput_changes = {};
    			if (changed.fields || changed.values) selectinput_changes.options = ctx.type.map(ctx.func);

    			if (!updating_selected && (changed.values || changed.fields)) {
    				updating_selected = true;
    				selectinput_changes.selected = ctx.values[ctx.field];
    				add_flush_callback(() => updating_selected = false);
    			}

    			selectinput.$set(selectinput_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(selectinput.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(selectinput.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(selectinput, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(23:36) ",
    		ctx
    	});

    	return block;
    }

    // (21:29) 
    function create_if_block_2(ctx) {
    	let updating_value;
    	let current;

    	function numberinput_value_binding(value) {
    		ctx.numberinput_value_binding.call(null, value, ctx);
    	}

    	let numberinput_props = {};

    	if (ctx.values[ctx.field] !== void 0) {
    		numberinput_props.value = ctx.values[ctx.field];
    	}

    	const numberinput = new NumberInput({ props: numberinput_props, $$inline: true });
    	binding_callbacks.push(() => bind(numberinput, "value", numberinput_value_binding));

    	const block = {
    		c: function create() {
    			create_component(numberinput.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(numberinput, target, anchor);
    			current = true;
    		},
    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			const numberinput_changes = {};

    			if (!updating_value && (changed.values || changed.fields)) {
    				updating_value = true;
    				numberinput_changes.value = ctx.values[ctx.field];
    				add_flush_callback(() => updating_value = false);
    			}

    			numberinput.$set(numberinput_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(numberinput.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(numberinput.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(numberinput, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(21:29) ",
    		ctx
    	});

    	return block;
    }

    // (19:29) 
    function create_if_block_1$1(ctx) {
    	let updating_value;
    	let current;

    	function incdecinput_value_binding(value) {
    		ctx.incdecinput_value_binding.call(null, value, ctx);
    	}

    	let incdecinput_props = {};

    	if (ctx.values[ctx.field] !== void 0) {
    		incdecinput_props.value = ctx.values[ctx.field];
    	}

    	const incdecinput = new IncDecInput({ props: incdecinput_props, $$inline: true });
    	binding_callbacks.push(() => bind(incdecinput, "value", incdecinput_value_binding));

    	const block = {
    		c: function create() {
    			create_component(incdecinput.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(incdecinput, target, anchor);
    			current = true;
    		},
    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			const incdecinput_changes = {};

    			if (!updating_value && (changed.values || changed.fields)) {
    				updating_value = true;
    				incdecinput_changes.value = ctx.values[ctx.field];
    				add_flush_callback(() => updating_value = false);
    			}

    			incdecinput.$set(incdecinput_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(incdecinput.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(incdecinput.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(incdecinput, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(19:29) ",
    		ctx
    	});

    	return block;
    }

    // (17:1) {#if type === 'toggle'}
    function create_if_block$2(ctx) {
    	let updating_checked;
    	let current;

    	function checkboxinput_checked_binding(value) {
    		ctx.checkboxinput_checked_binding.call(null, value, ctx);
    	}

    	let checkboxinput_props = { label: ctx.label };

    	if (ctx.values[ctx.field] !== void 0) {
    		checkboxinput_props.checked = ctx.values[ctx.field];
    	}

    	const checkboxinput = new CheckboxInput({
    			props: checkboxinput_props,
    			$$inline: true
    		});

    	binding_callbacks.push(() => bind(checkboxinput, "checked", checkboxinput_checked_binding));

    	const block = {
    		c: function create() {
    			create_component(checkboxinput.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(checkboxinput, target, anchor);
    			current = true;
    		},
    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			const checkboxinput_changes = {};
    			if (changed.fields) checkboxinput_changes.label = ctx.label;

    			if (!updating_checked && (changed.values || changed.fields)) {
    				updating_checked = true;
    				checkboxinput_changes.checked = ctx.values[ctx.field];
    				add_flush_callback(() => updating_checked = false);
    			}

    			checkboxinput.$set(checkboxinput_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(checkboxinput.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(checkboxinput.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(checkboxinput, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(17:1) {#if type === 'toggle'}",
    		ctx
    	});

    	return block;
    }

    // (11:0) {#each fields as {label, field, type}}
    function create_each_block$2(ctx) {
    	let div;
    	let t0;
    	let current_block_type_index;
    	let if_block1;
    	let t1;
    	let current;
    	let if_block0 = ctx.type !== "toggle" && create_if_block_4(ctx);
    	const if_block_creators = [create_if_block$2, create_if_block_1$1, create_if_block_2, create_if_block_3];
    	const if_blocks = [];

    	function select_block_type(changed, ctx) {
    		if (ctx.type === "toggle") return 0;
    		if (ctx.type === "incDec") return 1;
    		if (ctx.type === "number") return 2;
    		if (typeof ctx.type === "object") return 3;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(null, ctx))) {
    		if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			attr_dev(div, "class", "field svelte-1enhrwl");
    			add_location(div, file$7, 11, 4, 298);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append_dev(div, t0);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(div, null);
    			}

    			append_dev(div, t1);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			if (ctx.type !== "toggle") {
    				if (if_block0) {
    					if_block0.p(changed, ctx);
    				} else {
    					if_block0 = create_if_block_4(ctx);
    					if_block0.c();
    					if_block0.m(div, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(changed, ctx);

    			if (current_block_type_index === previous_block_index) {
    				if (~current_block_type_index) {
    					if_blocks[current_block_type_index].p(changed, ctx);
    				}
    			} else {
    				if (if_block1) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block1 = if_blocks[current_block_type_index];

    					if (!if_block1) {
    						if_block1 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block1.c();
    					}

    					transition_in(if_block1, 1);
    					if_block1.m(div, t1);
    				} else {
    					if_block1 = null;
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block0) if_block0.d();

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d();
    			}
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$2.name,
    		type: "each",
    		source: "(11:0) {#each fields as {label, field, type}}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$7(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = ctx.fields;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			if (changed.fields || changed.values) {
    				each_value = ctx.fields;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { fields } = $$props;
    	let { values } = $$props;
    	const writable_props = ["fields", "values"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<InputFields> was created with unknown prop '${key}'`);
    	});

    	function checkboxinput_checked_binding(value, { field }) {
    		values[field] = value;
    		$$invalidate("values", values);
    	}

    	function incdecinput_value_binding(value, { field }) {
    		values[field] = value;
    		$$invalidate("values", values);
    	}

    	function numberinput_value_binding(value, { field }) {
    		values[field] = value;
    		$$invalidate("values", values);
    	}

    	const func = option => ({ name: values[option], option });

    	function selectinput_selected_binding(value, { field }) {
    		values[field] = value;
    		$$invalidate("values", values);
    	}

    	$$self.$set = $$props => {
    		if ("fields" in $$props) $$invalidate("fields", fields = $$props.fields);
    		if ("values" in $$props) $$invalidate("values", values = $$props.values);
    	};

    	$$self.$capture_state = () => {
    		return { fields, values };
    	};

    	$$self.$inject_state = $$props => {
    		if ("fields" in $$props) $$invalidate("fields", fields = $$props.fields);
    		if ("values" in $$props) $$invalidate("values", values = $$props.values);
    	};

    	return {
    		fields,
    		values,
    		checkboxinput_checked_binding,
    		incdecinput_value_binding,
    		numberinput_value_binding,
    		func,
    		selectinput_selected_binding
    	};
    }

    class InputFields extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { fields: 0, values: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "InputFields",
    			options,
    			id: create_fragment$7.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (ctx.fields === undefined && !("fields" in props)) {
    			console.warn("<InputFields> was created without expected prop 'fields'");
    		}

    		if (ctx.values === undefined && !("values" in props)) {
    			console.warn("<InputFields> was created without expected prop 'values'");
    		}
    	}

    	get fields() {
    		throw new Error("<InputFields>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fields(value) {
    		throw new Error("<InputFields>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get values() {
    		throw new Error("<InputFields>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set values(value) {
    		throw new Error("<InputFields>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/ScoutView.svelte generated by Svelte v3.15.0 */
    const file$8 = "src/ScoutView.svelte";

    // (42:4) <Button on:click={switchToOverview}>
    function create_default_slot$2(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Back");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$2.name,
    		type: "slot",
    		source: "(42:4) <Button on:click={switchToOverview}>",
    		ctx
    	});

    	return block;
    }

    // (50:4) {:else}
    function create_else_block$2(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Loading");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$2.name,
    		type: "else",
    		source: "(50:4) {:else}",
    		ctx
    	});

    	return block;
    }

    // (43:4) {#if currentPageValue}
    function create_if_block$3(ctx) {
    	let div;
    	let updating_values;
    	let t0;
    	let updating_values_1;
    	let t1;
    	let updating_values_2;
    	let t2;
    	let updating_values_3;
    	let current;

    	function inputfields0_values_binding(value) {
    		ctx.inputfields0_values_binding.call(null, value);
    	}

    	let inputfields0_props = { fields: matchFields };

    	if (ctx.currentPageValue !== void 0) {
    		inputfields0_props.values = ctx.currentPageValue;
    	}

    	const inputfields0 = new InputFields({
    			props: inputfields0_props,
    			$$inline: true
    		});

    	binding_callbacks.push(() => bind(inputfields0, "values", inputfields0_values_binding));

    	function inputfields1_values_binding(value_1) {
    		ctx.inputfields1_values_binding.call(null, value_1);
    	}

    	let inputfields1_props = { fields: autoFields };

    	if (ctx.currentPageValue !== void 0) {
    		inputfields1_props.values = ctx.currentPageValue;
    	}

    	const inputfields1 = new InputFields({
    			props: inputfields1_props,
    			$$inline: true
    		});

    	binding_callbacks.push(() => bind(inputfields1, "values", inputfields1_values_binding));

    	function inputfields2_values_binding(value_2) {
    		ctx.inputfields2_values_binding.call(null, value_2);
    	}

    	let inputfields2_props = { fields: teleFields };

    	if (ctx.currentPageValue !== void 0) {
    		inputfields2_props.values = ctx.currentPageValue;
    	}

    	const inputfields2 = new InputFields({
    			props: inputfields2_props,
    			$$inline: true
    		});

    	binding_callbacks.push(() => bind(inputfields2, "values", inputfields2_values_binding));

    	function inputfields3_values_binding(value_3) {
    		ctx.inputfields3_values_binding.call(null, value_3);
    	}

    	let inputfields3_props = { fields: endFields };

    	if (ctx.currentPageValue !== void 0) {
    		inputfields3_props.values = ctx.currentPageValue;
    	}

    	const inputfields3 = new InputFields({
    			props: inputfields3_props,
    			$$inline: true
    		});

    	binding_callbacks.push(() => bind(inputfields3, "values", inputfields3_values_binding));

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(inputfields0.$$.fragment);
    			t0 = space();
    			create_component(inputfields1.$$.fragment);
    			t1 = space();
    			create_component(inputfields2.$$.fragment);
    			t2 = space();
    			create_component(inputfields3.$$.fragment);
    			attr_dev(div, "id", "fields");
    			attr_dev(div, "class", "svelte-1kcw3no");
    			add_location(div, file$8, 43, 1, 974);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(inputfields0, div, null);
    			append_dev(div, t0);
    			mount_component(inputfields1, div, null);
    			append_dev(div, t1);
    			mount_component(inputfields2, div, null);
    			append_dev(div, t2);
    			mount_component(inputfields3, div, null);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			const inputfields0_changes = {};

    			if (!updating_values && changed.currentPageValue) {
    				updating_values = true;
    				inputfields0_changes.values = ctx.currentPageValue;
    				add_flush_callback(() => updating_values = false);
    			}

    			inputfields0.$set(inputfields0_changes);
    			const inputfields1_changes = {};

    			if (!updating_values_1 && changed.currentPageValue) {
    				updating_values_1 = true;
    				inputfields1_changes.values = ctx.currentPageValue;
    				add_flush_callback(() => updating_values_1 = false);
    			}

    			inputfields1.$set(inputfields1_changes);
    			const inputfields2_changes = {};

    			if (!updating_values_2 && changed.currentPageValue) {
    				updating_values_2 = true;
    				inputfields2_changes.values = ctx.currentPageValue;
    				add_flush_callback(() => updating_values_2 = false);
    			}

    			inputfields2.$set(inputfields2_changes);
    			const inputfields3_changes = {};

    			if (!updating_values_3 && changed.currentPageValue) {
    				updating_values_3 = true;
    				inputfields3_changes.values = ctx.currentPageValue;
    				add_flush_callback(() => updating_values_3 = false);
    			}

    			inputfields3.$set(inputfields3_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(inputfields0.$$.fragment, local);
    			transition_in(inputfields1.$$.fragment, local);
    			transition_in(inputfields2.$$.fragment, local);
    			transition_in(inputfields3.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(inputfields0.$$.fragment, local);
    			transition_out(inputfields1.$$.fragment, local);
    			transition_out(inputfields2.$$.fragment, local);
    			transition_out(inputfields3.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(inputfields0);
    			destroy_component(inputfields1);
    			destroy_component(inputfields2);
    			destroy_component(inputfields3);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(43:4) {#if currentPageValue}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$8(ctx) {
    	let div;
    	let t;
    	let current_block_type_index;
    	let if_block;
    	let current;

    	const button = new Button({
    			props: {
    				$$slots: { default: [create_default_slot$2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button.$on("click", switchToOverview);
    	const if_block_creators = [create_if_block$3, create_else_block$2];
    	const if_blocks = [];

    	function select_block_type(changed, ctx) {
    		if (ctx.currentPageValue) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(null, ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(button.$$.fragment);
    			t = space();
    			if_block.c();
    			attr_dev(div, "id", "container");
    			attr_dev(div, "class", "svelte-1kcw3no");
    			add_location(div, file$8, 40, 0, 871);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(button, div, null);
    			append_dev(div, t);
    			if_blocks[current_block_type_index].m(div, null);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			const button_changes = {};

    			if (changed.$$scope) {
    				button_changes.$$scope = { changed, ctx };
    			}

    			button.$set(button_changes);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(changed, ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(changed, ctx);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(div, null);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(button.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(button);
    			if_blocks[current_block_type_index].d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$8.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function switchToOverview() {
    	view.set("overview");
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let pagesStore;
    	let pagesValue;
    	let currentPageValue;
    	let unsubscribe;

    	function setCurrentPageValue(value) {
    		if (pagesStore) {
    			pagesStore.set(value.index, value);
    		}
    	}

    	pagesStoreAsync.then(store => {
    		pagesStore = store;

    		unsubscribe = pagesStore.subscribe(val => {
    			pagesValue = val;
    			$$invalidate("currentPageValue", currentPageValue = pagesValue[pagesValue.length - 1]);
    		});
    	});

    	onDestroy(() => {
    		if (unsubscribe) {
    			unsubscribe();
    		}
    	});

    	function inputfields0_values_binding(value) {
    		currentPageValue = value;
    		$$invalidate("currentPageValue", currentPageValue);
    	}

    	function inputfields1_values_binding(value_1) {
    		currentPageValue = value_1;
    		$$invalidate("currentPageValue", currentPageValue);
    	}

    	function inputfields2_values_binding(value_2) {
    		currentPageValue = value_2;
    		$$invalidate("currentPageValue", currentPageValue);
    	}

    	function inputfields3_values_binding(value_3) {
    		currentPageValue = value_3;
    		$$invalidate("currentPageValue", currentPageValue);
    	}

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("pagesStore" in $$props) pagesStore = $$props.pagesStore;
    		if ("pagesValue" in $$props) pagesValue = $$props.pagesValue;
    		if ("currentPageValue" in $$props) $$invalidate("currentPageValue", currentPageValue = $$props.currentPageValue);
    		if ("unsubscribe" in $$props) unsubscribe = $$props.unsubscribe;
    	};

    	$$self.$$.update = (changed = { currentPageValue: 1 }) => {
    		if (changed.currentPageValue) {
    			 setCurrentPageValue(currentPageValue);
    		}
    	};

    	return {
    		currentPageValue,
    		inputfields0_values_binding,
    		inputfields1_values_binding,
    		inputfields2_values_binding,
    		inputfields3_values_binding
    	};
    }

    class ScoutView extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ScoutView",
    			options,
    			id: create_fragment$8.name
    		});
    	}
    }

    /* src/ManageView.svelte generated by Svelte v3.15.0 */
    const file$9 = "src/ManageView.svelte";

    // (78:1) <Button on:click={switchToOverview}>
    function create_default_slot_4$1(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Back");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_4$1.name,
    		type: "slot",
    		source: "(78:1) <Button on:click={switchToOverview}>",
    		ctx
    	});

    	return block;
    }

    // (82:21) <Button on:click={copy}>
    function create_default_slot_3$1(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Copy");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_3$1.name,
    		type: "slot",
    		source: "(82:21) <Button on:click={copy}>",
    		ctx
    	});

    	return block;
    }

    // (83:21) <Button on:click={paste}>
    function create_default_slot_2$1(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Paste");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2$1.name,
    		type: "slot",
    		source: "(83:21) <Button on:click={paste}>",
    		ctx
    	});

    	return block;
    }

    // (93:4) {:else}
    function create_else_block$3(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Loading");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$3.name,
    		type: "else",
    		source: "(93:4) {:else}",
    		ctx
    	});

    	return block;
    }

    // (85:4) {#if pagesValue}
    function create_if_block$4(ctx) {
    	let div2;
    	let div0;
    	let t0;
    	let div1;
    	let t1;
    	let if_block_anchor;
    	let current;

    	const button0 = new Button({
    			props: {
    				$$slots: { default: [create_default_slot_1$2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button0.$on("click", ctx.download);

    	const button1 = new Button({
    			props: {
    				$$slots: { default: [create_default_slot$3] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button1.$on("click", ctx.pickFile);
    	let if_block = ctx.uploading && create_if_block_1$2(ctx);

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			create_component(button0.$$.fragment);
    			t0 = space();
    			div1 = element("div");
    			create_component(button1.$$.fragment);
    			t1 = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr_dev(div0, "class", "padded svelte-h9z6wo");
    			add_location(div0, file$9, 86, 5, 1903);
    			attr_dev(div1, "class", "padded svelte-h9z6wo");
    			add_location(div1, file$9, 87, 5, 1980);
    			attr_dev(div2, "class", "row svelte-h9z6wo");
    			add_location(div2, file$9, 85, 1, 1880);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div0);
    			mount_component(button0, div0, null);
    			append_dev(div2, t0);
    			append_dev(div2, div1);
    			mount_component(button1, div1, null);
    			insert_dev(target, t1, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			const button0_changes = {};

    			if (changed.$$scope) {
    				button0_changes.$$scope = { changed, ctx };
    			}

    			button0.$set(button0_changes);
    			const button1_changes = {};

    			if (changed.$$scope) {
    				button1_changes.$$scope = { changed, ctx };
    			}

    			button1.$set(button1_changes);

    			if (ctx.uploading) {
    				if (!if_block) {
    					if_block = create_if_block_1$2(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(button0.$$.fragment, local);
    			transition_in(button1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(button0.$$.fragment, local);
    			transition_out(button1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			destroy_component(button0);
    			destroy_component(button1);
    			if (detaching) detach_dev(t1);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$4.name,
    		type: "if",
    		source: "(85:4) {#if pagesValue}",
    		ctx
    	});

    	return block;
    }

    // (87:25) <Button on:click={download}>
    function create_default_slot_1$2(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Download");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1$2.name,
    		type: "slot",
    		source: "(87:25) <Button on:click={download}>",
    		ctx
    	});

    	return block;
    }

    // (88:25) <Button on:click={pickFile}>
    function create_default_slot$3(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Upload");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$3.name,
    		type: "slot",
    		source: "(88:25) <Button on:click={pickFile}>",
    		ctx
    	});

    	return block;
    }

    // (90:1) {#if uploading}
    function create_if_block_1$2(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Uploading files");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$2.name,
    		type: "if",
    		source: "(90:1) {#if uploading}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$9(ctx) {
    	let a;
    	let t1;
    	let input0;
    	let t2;
    	let div5;
    	let div0;
    	let t3;
    	let div4;
    	let div1;
    	let input1;
    	let input1_value_value;
    	let t4;
    	let div2;
    	let t5;
    	let div3;
    	let t6;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	let dispose;

    	const button0 = new Button({
    			props: {
    				$$slots: { default: [create_default_slot_4$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button0.$on("click", switchToOverview$1);

    	const button1 = new Button({
    			props: {
    				$$slots: { default: [create_default_slot_3$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button1.$on("click", ctx.copy);

    	const button2 = new Button({
    			props: {
    				$$slots: { default: [create_default_slot_2$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button2.$on("click", ctx.paste);
    	const if_block_creators = [create_if_block$4, create_else_block$3];
    	const if_blocks = [];

    	function select_block_type(changed, ctx) {
    		if (ctx.pagesValue) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(null, ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			a = element("a");
    			a.textContent = "Download";
    			t1 = space();
    			input0 = element("input");
    			t2 = space();
    			div5 = element("div");
    			div0 = element("div");
    			create_component(button0.$$.fragment);
    			t3 = space();
    			div4 = element("div");
    			div1 = element("div");
    			input1 = element("input");
    			t4 = space();
    			div2 = element("div");
    			create_component(button1.$$.fragment);
    			t5 = space();
    			div3 = element("div");
    			create_component(button2.$$.fragment);
    			t6 = space();
    			if_block.c();
    			attr_dev(a, "class", "hidden svelte-h9z6wo");
    			attr_dev(a, "href", "data:text/json,");
    			add_location(a, file$9, 72, 0, 1301);
    			attr_dev(input0, "class", "hidden svelte-h9z6wo");
    			attr_dev(input0, "type", "file");
    			input0.multiple = true;
    			add_location(input0, file$9, 73, 0, 1382);
    			attr_dev(div0, "class", "padded svelte-h9z6wo");
    			add_location(div0, file$9, 76, 4, 1496);
    			attr_dev(input1, "type", "text");
    			input1.value = input1_value_value = JSON.stringify(ctx.pagesValue);
    			input1.readOnly = true;
    			attr_dev(input1, "class", "svelte-h9z6wo");
    			add_location(input1, file$9, 80, 21, 1622);
    			attr_dev(div1, "class", "padded svelte-h9z6wo");
    			add_location(div1, file$9, 80, 1, 1602);
    			attr_dev(div2, "class", "padded svelte-h9z6wo");
    			add_location(div2, file$9, 81, 1, 1716);
    			attr_dev(div3, "class", "padded svelte-h9z6wo");
    			add_location(div3, file$9, 82, 1, 1781);
    			attr_dev(div4, "class", "row svelte-h9z6wo");
    			add_location(div4, file$9, 79, 4, 1583);
    			attr_dev(div5, "class", "container svelte-h9z6wo");
    			add_location(div5, file$9, 75, 0, 1468);
    			dispose = listen_dev(input0, "change", ctx.upload, false, false, false);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			ctx.a_binding(a);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, input0, anchor);
    			ctx.input0_binding(input0);
    			insert_dev(target, t2, anchor);
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div0);
    			mount_component(button0, div0, null);
    			append_dev(div5, t3);
    			append_dev(div5, div4);
    			append_dev(div4, div1);
    			append_dev(div1, input1);
    			ctx.input1_binding(input1);
    			append_dev(div4, t4);
    			append_dev(div4, div2);
    			mount_component(button1, div2, null);
    			append_dev(div4, t5);
    			append_dev(div4, div3);
    			mount_component(button2, div3, null);
    			append_dev(div5, t6);
    			if_blocks[current_block_type_index].m(div5, null);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			const button0_changes = {};

    			if (changed.$$scope) {
    				button0_changes.$$scope = { changed, ctx };
    			}

    			button0.$set(button0_changes);

    			if (!current || changed.pagesValue && input1_value_value !== (input1_value_value = JSON.stringify(ctx.pagesValue))) {
    				prop_dev(input1, "value", input1_value_value);
    			}

    			const button1_changes = {};

    			if (changed.$$scope) {
    				button1_changes.$$scope = { changed, ctx };
    			}

    			button1.$set(button1_changes);
    			const button2_changes = {};

    			if (changed.$$scope) {
    				button2_changes.$$scope = { changed, ctx };
    			}

    			button2.$set(button2_changes);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(changed, ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(changed, ctx);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(div5, null);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(button0.$$.fragment, local);
    			transition_in(button1.$$.fragment, local);
    			transition_in(button2.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(button0.$$.fragment, local);
    			transition_out(button1.$$.fragment, local);
    			transition_out(button2.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    			ctx.a_binding(null);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(input0);
    			ctx.input0_binding(null);
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(div5);
    			destroy_component(button0);
    			ctx.input1_binding(null);
    			destroy_component(button1);
    			destroy_component(button2);
    			if_blocks[current_block_type_index].d();
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$9.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function switchToOverview$1() {
    	view.set("overview");
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let pagesValue;
    	let pagesStore;

    	pagesStoreAsync.then(store => {
    		pagesStore = store;
    		pagesStore.subscribe(val => $$invalidate("pagesValue", pagesValue = val));
    	});

    	function merge(pages) {
    		for (const page of JSON.parse(pages)) {
    			pagesStore.merge(page);
    		}
    	}

    	let downloadAnchor;

    	function download() {
    		const data = "data:text/json;charset=utf8," + encodeURIComponent(JSON.stringify(pagesValue));
    		$$invalidate("downloadAnchor", downloadAnchor.href = data, downloadAnchor);
    		$$invalidate("downloadAnchor", downloadAnchor.download = "scouting.json", downloadAnchor);
    		downloadAnchor.click();
    	}

    	let fileInput;

    	function pickFile() {
    		fileInput.click();
    	}

    	let uploading = false;
    	const reader = new FileReader();

    	function upload() {
    		for (const file of fileInput.files) {
    			reader.readAsText(file);
    			$$invalidate("uploading", uploading = true);

    			reader.onload = () => {
    				$$invalidate("uploading", uploading = false);
    				merge(reader.result);
    			};
    		}
    	}

    	let copyField;

    	function copy() {
    		copyField.select();
    		document.execCommand("copy");
    	}

    	function paste() {
    		const result = prompt("Paste");

    		if (result != null) {
    			merge(result);
    		}
    	}

    	function a_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate("downloadAnchor", downloadAnchor = $$value);
    		});
    	}

    	function input0_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate("fileInput", fileInput = $$value);
    		});
    	}

    	function input1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate("copyField", copyField = $$value);
    		});
    	}

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("pagesValue" in $$props) $$invalidate("pagesValue", pagesValue = $$props.pagesValue);
    		if ("pagesStore" in $$props) pagesStore = $$props.pagesStore;
    		if ("downloadAnchor" in $$props) $$invalidate("downloadAnchor", downloadAnchor = $$props.downloadAnchor);
    		if ("fileInput" in $$props) $$invalidate("fileInput", fileInput = $$props.fileInput);
    		if ("uploading" in $$props) $$invalidate("uploading", uploading = $$props.uploading);
    		if ("copyField" in $$props) $$invalidate("copyField", copyField = $$props.copyField);
    	};

    	return {
    		pagesValue,
    		downloadAnchor,
    		download,
    		fileInput,
    		pickFile,
    		uploading,
    		upload,
    		copyField,
    		copy,
    		paste,
    		a_binding,
    		input0_binding,
    		input1_binding
    	};
    }

    class ManageView extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$9, create_fragment$9, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ManageView",
    			options,
    			id: create_fragment$9.name
    		});
    	}
    }

    /* src/AnalysisView.svelte generated by Svelte v3.15.0 */

    const { Object: Object_1$1 } = globals;
    const file$a = "src/AnalysisView.svelte";

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = Object_1$1.create(ctx);
    	child_ctx.field = list[i].field;
    	child_ctx.type = list[i].type;
    	child_ctx.label = list[i].label;
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = Object_1$1.create(ctx);
    	child_ctx.field = list[i].field;
    	child_ctx.type = list[i].type;
    	child_ctx.label = list[i].label;
    	return child_ctx;
    }

    function get_each_context_3(ctx, list, i) {
    	const child_ctx = Object_1$1.create(ctx);
    	child_ctx.field = list[i].field;
    	child_ctx.type = list[i].type;
    	child_ctx.label = list[i].label;
    	return child_ctx;
    }

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = Object_1$1.create(ctx);
    	child_ctx.team = list[i];
    	return child_ctx;
    }

    function get_each_context_4(ctx, list, i) {
    	const child_ctx = Object_1$1.create(ctx);
    	child_ctx.field = list[i].field;
    	child_ctx.type = list[i].type;
    	child_ctx.label = list[i].label;
    	return child_ctx;
    }

    function get_each_context_5(ctx, list, i) {
    	const child_ctx = Object_1$1.create(ctx);
    	child_ctx.field = list[i].field;
    	child_ctx.type = list[i].type;
    	child_ctx.label = list[i].label;
    	return child_ctx;
    }

    function get_each_context_6(ctx, list, i) {
    	const child_ctx = Object_1$1.create(ctx);
    	child_ctx.field = list[i].field;
    	child_ctx.type = list[i].type;
    	child_ctx.label = list[i].label;
    	return child_ctx;
    }

    // (55:4) <Button on:click={overview}>
    function create_default_slot$4(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Back");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$4.name,
    		type: "slot",
    		source: "(55:4) <Button on:click={overview}>",
    		ctx
    	});

    	return block;
    }

    // (59:5) {#each autoFields as {field, type, label}}
    function create_each_block_6(ctx) {
    	let th;
    	let t_value = ctx.label + "";
    	let t;

    	const block = {
    		c: function create() {
    			th = element("th");
    			t = text(t_value);
    			add_location(th, file$a, 59, 2, 1367);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, th, anchor);
    			append_dev(th, t);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(th);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_6.name,
    		type: "each",
    		source: "(59:5) {#each autoFields as {field, type, label}}",
    		ctx
    	});

    	return block;
    }

    // (62:5) {#each teleFields as {field, type, label}}
    function create_each_block_5(ctx) {
    	let th;
    	let t_value = ctx.label + "";
    	let t;

    	const block = {
    		c: function create() {
    			th = element("th");
    			t = text(t_value);
    			add_location(th, file$a, 62, 2, 1447);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, th, anchor);
    			append_dev(th, t);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(th);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_5.name,
    		type: "each",
    		source: "(62:5) {#each teleFields as {field, type, label}}",
    		ctx
    	});

    	return block;
    }

    // (65:5) {#each endFields as {field, type, label}}
    function create_each_block_4(ctx) {
    	let th;
    	let t_value = ctx.label + "";
    	let t;

    	const block = {
    		c: function create() {
    			th = element("th");
    			t = text(t_value);
    			add_location(th, file$a, 65, 2, 1526);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, th, anchor);
    			append_dev(th, t);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(th);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_4.name,
    		type: "each",
    		source: "(65:5) {#each endFields as {field, type, label}}",
    		ctx
    	});

    	return block;
    }

    // (72:2) {#each autoFields as {field, type, label}}
    function create_each_block_3(ctx) {
    	let td;
    	let t_value = ctx.team[ctx.field] + "";
    	let t;

    	const block = {
    		c: function create() {
    			td = element("td");
    			t = text(t_value);
    			add_location(td, file$a, 72, 6, 1669);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, td, anchor);
    			append_dev(td, t);
    		},
    		p: function update(changed, ctx) {
    			if (changed.data && t_value !== (t_value = ctx.team[ctx.field] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(td);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_3.name,
    		type: "each",
    		source: "(72:2) {#each autoFields as {field, type, label}}",
    		ctx
    	});

    	return block;
    }

    // (77:2) {#each teleFields as {field, type, label}}
    function create_each_block_2(ctx) {
    	let td;
    	let t_value = ctx.team[ctx.field] + "";
    	let t;

    	const block = {
    		c: function create() {
    			td = element("td");
    			t = text(t_value);
    			add_location(td, file$a, 77, 6, 1764);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, td, anchor);
    			append_dev(td, t);
    		},
    		p: function update(changed, ctx) {
    			if (changed.data && t_value !== (t_value = ctx.team[ctx.field] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(td);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2.name,
    		type: "each",
    		source: "(77:2) {#each teleFields as {field, type, label}}",
    		ctx
    	});

    	return block;
    }

    // (82:2) {#each endFields as {field, type, label}}
    function create_each_block_1(ctx) {
    	let td;
    	let t_value = ctx.team[ctx.field] + "";
    	let t;

    	const block = {
    		c: function create() {
    			td = element("td");
    			t = text(t_value);
    			add_location(td, file$a, 82, 6, 1858);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, td, anchor);
    			append_dev(td, t);
    		},
    		p: function update(changed, ctx) {
    			if (changed.data && t_value !== (t_value = ctx.team[ctx.field] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(td);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(82:2) {#each endFields as {field, type, label}}",
    		ctx
    	});

    	return block;
    }

    // (69:1) {#each data as team}
    function create_each_block$3(ctx) {
    	let tr;
    	let td;
    	let t0_value = ctx.team.Team + "";
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let each_value_3 = autoFields;
    	let each_blocks_2 = [];

    	for (let i = 0; i < each_value_3.length; i += 1) {
    		each_blocks_2[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
    	}

    	let each_value_2 = teleFields;
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_1[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	let each_value_1 = endFields;
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td = element("td");
    			t0 = text(t0_value);
    			t1 = space();

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			t2 = space();

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t3 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t4 = space();
    			add_location(td, file$a, 70, 2, 1597);
    			add_location(tr, file$a, 69, 5, 1590);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td);
    			append_dev(td, t0);
    			append_dev(tr, t1);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(tr, null);
    			}

    			append_dev(tr, t2);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(tr, null);
    			}

    			append_dev(tr, t3);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tr, null);
    			}

    			append_dev(tr, t4);
    		},
    		p: function update(changed, ctx) {
    			if (changed.data && t0_value !== (t0_value = ctx.team.Team + "")) set_data_dev(t0, t0_value);

    			if (changed.data || changed.autoFields) {
    				each_value_3 = autoFields;
    				let i;

    				for (i = 0; i < each_value_3.length; i += 1) {
    					const child_ctx = get_each_context_3(ctx, each_value_3, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(changed, child_ctx);
    					} else {
    						each_blocks_2[i] = create_each_block_3(child_ctx);
    						each_blocks_2[i].c();
    						each_blocks_2[i].m(tr, t2);
    					}
    				}

    				for (; i < each_blocks_2.length; i += 1) {
    					each_blocks_2[i].d(1);
    				}

    				each_blocks_2.length = each_value_3.length;
    			}

    			if (changed.data || changed.teleFields) {
    				each_value_2 = teleFields;
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(changed, child_ctx);
    					} else {
    						each_blocks_1[i] = create_each_block_2(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(tr, t3);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_2.length;
    			}

    			if (changed.data || changed.endFields) {
    				each_value_1 = endFields;
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tr, t4);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr);
    			destroy_each(each_blocks_2, detaching);
    			destroy_each(each_blocks_1, detaching);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$3.name,
    		type: "each",
    		source: "(69:1) {#each data as team}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$a(ctx) {
    	let div;
    	let t0;
    	let table;
    	let tr;
    	let td;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let current;

    	const button = new Button({
    			props: {
    				$$slots: { default: [create_default_slot$4] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	button.$on("click", overview);
    	let each_value_6 = autoFields;
    	let each_blocks_3 = [];

    	for (let i = 0; i < each_value_6.length; i += 1) {
    		each_blocks_3[i] = create_each_block_6(get_each_context_6(ctx, each_value_6, i));
    	}

    	let each_value_5 = teleFields;
    	let each_blocks_2 = [];

    	for (let i = 0; i < each_value_5.length; i += 1) {
    		each_blocks_2[i] = create_each_block_5(get_each_context_5(ctx, each_value_5, i));
    	}

    	let each_value_4 = endFields;
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_4.length; i += 1) {
    		each_blocks_1[i] = create_each_block_4(get_each_context_4(ctx, each_value_4, i));
    	}

    	let each_value = ctx.data;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(button.$$.fragment);
    			t0 = space();
    			table = element("table");
    			tr = element("tr");
    			td = element("td");
    			td.textContent = "Team";
    			t2 = space();

    			for (let i = 0; i < each_blocks_3.length; i += 1) {
    				each_blocks_3[i].c();
    			}

    			t3 = space();

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			t4 = space();

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t5 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			add_location(td, file$a, 57, 5, 1303);
    			add_location(tr, file$a, 56, 1, 1293);
    			attr_dev(table, "class", "table");
    			add_location(table, file$a, 55, 4, 1270);
    			attr_dev(div, "class", "container svelte-1gjwccd");
    			add_location(div, file$a, 53, 0, 1196);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(button, div, null);
    			append_dev(div, t0);
    			append_dev(div, table);
    			append_dev(table, tr);
    			append_dev(tr, td);
    			append_dev(tr, t2);

    			for (let i = 0; i < each_blocks_3.length; i += 1) {
    				each_blocks_3[i].m(tr, null);
    			}

    			append_dev(tr, t3);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(tr, null);
    			}

    			append_dev(tr, t4);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(tr, null);
    			}

    			append_dev(table, t5);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(table, null);
    			}

    			current = true;
    		},
    		p: function update(changed, ctx) {
    			const button_changes = {};

    			if (changed.$$scope) {
    				button_changes.$$scope = { changed, ctx };
    			}

    			button.$set(button_changes);

    			if (changed.autoFields) {
    				each_value_6 = autoFields;
    				let i;

    				for (i = 0; i < each_value_6.length; i += 1) {
    					const child_ctx = get_each_context_6(ctx, each_value_6, i);

    					if (each_blocks_3[i]) {
    						each_blocks_3[i].p(changed, child_ctx);
    					} else {
    						each_blocks_3[i] = create_each_block_6(child_ctx);
    						each_blocks_3[i].c();
    						each_blocks_3[i].m(tr, t3);
    					}
    				}

    				for (; i < each_blocks_3.length; i += 1) {
    					each_blocks_3[i].d(1);
    				}

    				each_blocks_3.length = each_value_6.length;
    			}

    			if (changed.teleFields) {
    				each_value_5 = teleFields;
    				let i;

    				for (i = 0; i < each_value_5.length; i += 1) {
    					const child_ctx = get_each_context_5(ctx, each_value_5, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(changed, child_ctx);
    					} else {
    						each_blocks_2[i] = create_each_block_5(child_ctx);
    						each_blocks_2[i].c();
    						each_blocks_2[i].m(tr, t4);
    					}
    				}

    				for (; i < each_blocks_2.length; i += 1) {
    					each_blocks_2[i].d(1);
    				}

    				each_blocks_2.length = each_value_5.length;
    			}

    			if (changed.endFields) {
    				each_value_4 = endFields;
    				let i;

    				for (i = 0; i < each_value_4.length; i += 1) {
    					const child_ctx = get_each_context_4(ctx, each_value_4, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(changed, child_ctx);
    					} else {
    						each_blocks_1[i] = create_each_block_4(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(tr, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_4.length;
    			}

    			if (changed.endFields || changed.data || changed.teleFields || changed.autoFields) {
    				each_value = ctx.data;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(table, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(button);
    			destroy_each(each_blocks_3, detaching);
    			destroy_each(each_blocks_2, detaching);
    			destroy_each(each_blocks_1, detaching);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$a.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function overview() {
    	view.set("overview");
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let data = {};
    	let unsubscribe;

    	pagesStoreAsync.then(store => {
    		unsubscribe = store.subscribe(pages => {
    			for (const key in pages) {
    				const page = pages[key];
    				const team = page[page.MatchTeam];

    				if (data[team] == null) {
    					$$invalidate("data", data[team] = {}, data);
    				}

    				const fields = autoFields.concat(teleFields, endFields);

    				for (const field of fields) {
    					if (data[team][field.field] == null) {
    						$$invalidate("data", data[team][field.field] = [], data);
    					}

    					if (field.type === "incDec") {
    						data[team][field.field].push(page[field.field]);
    					} else if (field.type === "toggle") {
    						console.log(page[field.field]);
    						data[team][field.field].push(page[field.field] ? 1 : 0);
    					}
    				}
    			}

    			console.log(data);
    			$$invalidate("data", data = Object.keys(data).map(key => ({ ...data[key], Team: key })));
    			console.log(data);
    		});
    	});

    	onDestroy(() => {
    		if (unsubscribe) {
    			unsubscribe();
    		}
    	});

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("data" in $$props) $$invalidate("data", data = $$props.data);
    		if ("unsubscribe" in $$props) unsubscribe = $$props.unsubscribe;
    	};

    	return { data };
    }

    class AnalysisView extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$a, create_fragment$a, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "AnalysisView",
    			options,
    			id: create_fragment$a.name
    		});
    	}
    }

    /* src/App.svelte generated by Svelte v3.15.0 */

    // (16:31) 
    function create_if_block_3$1(ctx) {
    	let current;
    	const analysisview = new AnalysisView({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(analysisview.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(analysisview, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(analysisview.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(analysisview.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(analysisview, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3$1.name,
    		type: "if",
    		source: "(16:31) ",
    		ctx
    	});

    	return block;
    }

    // (14:29) 
    function create_if_block_2$1(ctx) {
    	let current;
    	const manageview = new ManageView({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(manageview.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(manageview, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(manageview.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(manageview.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(manageview, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$1.name,
    		type: "if",
    		source: "(14:29) ",
    		ctx
    	});

    	return block;
    }

    // (12:28) 
    function create_if_block_1$3(ctx) {
    	let current;
    	const scoutview = new ScoutView({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(scoutview.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(scoutview, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(scoutview.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(scoutview.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(scoutview, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$3.name,
    		type: "if",
    		source: "(12:28) ",
    		ctx
    	});

    	return block;
    }

    // (10:0) {#if $view === 'overview'}
    function create_if_block$5(ctx) {
    	let current;
    	const overview = new Overview({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(overview.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(overview, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(overview.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(overview.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(overview, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$5.name,
    		type: "if",
    		source: "(10:0) {#if $view === 'overview'}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$b(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$5, create_if_block_1$3, create_if_block_2$1, create_if_block_3$1];
    	const if_blocks = [];

    	function select_block_type(changed, ctx) {
    		if (ctx.$view === "overview") return 0;
    		if (ctx.$view === "scout") return 1;
    		if (ctx.$view === "manage") return 2;
    		if (ctx.$view === "analysis") return 3;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(null, ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(target, anchor);
    			}

    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(changed, ctx);

    			if (current_block_type_index !== previous_block_index) {
    				if (if_block) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];

    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					}

    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				} else {
    					if_block = null;
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d(detaching);
    			}

    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$b.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let $view;
    	validate_store(view, "view");
    	component_subscribe($$self, view, $$value => $$invalidate("$view", $view = $$value));

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("$view" in $$props) view.set($view = $$props.$view);
    	};

    	return { $view };
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$b.name
    		});
    	}
    }

    const app = new App({
        target: document.body
    });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
    	     .then(registration => console.log("Registration succeeded with scope: " + registration.scope),
    		   error => console.error("Registration failed: " + error));
    }

    return app;

}());
