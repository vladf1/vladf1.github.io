(function (global) {
    var queues = new WeakMap();
    var activeAnimations = new WeakMap();

    function MiniQuery(elements) {
        this.elements = elements;
    }

    function isAnimated(element) {
        return (activeAnimations.get(element) || 0) > 0;
    }

    function setAnimated(element, active) {
        var count = activeAnimations.get(element) || 0;
        count += active ? 1 : -1;

        if (count > 0) {
            activeAnimations.set(element, count);
        }
        else {
            activeAnimations.delete(element);
        }
    }

    function swing(progress) {
        return 0.5 - Math.cos(progress * Math.PI) / 2;
    }

    function currentValue(element, property) {
        if (property == "scrollTop") {
            return element.scrollTop;
        }

        return parseFloat(getComputedStyle(element)[property]) || 0;
    }

    function setValue(element, property, value) {
        if (property == "scrollTop") {
            element.scrollTop = value;
        }
        else {
            element.style[property] = value + "px";
        }
    }

    function wait(duration) {
        return new Promise(function (resolve) {
            setTimeout(resolve, duration);
        });
    }

    function runAnimation(element, properties, duration) {
        var starts = {};
        var changes = {};

        Object.keys(properties).forEach(function (property) {
            starts[property] = currentValue(element, property);
            changes[property] = properties[property] - starts[property];
        });

        return new Promise(function (resolve) {
            var startTime = Date.now();

            function tick() {
                var progress = Math.min((Date.now() - startTime) / duration, 1);
                var eased = swing(progress);

                Object.keys(properties).forEach(function (property) {
                    setValue(element, property, starts[property] + changes[property] * eased);
                });

                if (progress < 1) {
                    setTimeout(tick, 13);
                }
                else {
                    resolve();
                }
            }

            tick();
        });
    }

    function enqueue(element, task) {
        var previous = queues.get(element) || Promise.resolve();
        var next = previous.then(task);

        queues.set(element, next);
        next.then(function () {
            if (queues.get(element) == next) {
                queues.delete(element);
            }
        });

        return next;
    }

    function ready(fn) {
        if (document.readyState == "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        }
        else {
            fn();
        }
    }

    function select(selector) {
        var wantsAnimated = selector.indexOf(":animated") >= 0;
        var wantsNotAnimated = selector.indexOf(":not(:animated)") >= 0;
        var cssSelector = selector.replace(":not(:animated)", "").replace(":animated", "");
        var elements = Array.prototype.slice.call(document.querySelectorAll(cssSelector));

        if (wantsNotAnimated) {
            return elements.filter(function (element) {
                return !isAnimated(element);
            });
        }

        if (wantsAnimated) {
            return elements.filter(isAnimated);
        }

        return elements;
    }

    function $(value) {
        if (typeof value == "function") {
            ready(value);
            return new MiniQuery([]);
        }

        if (typeof value == "string") {
            return new MiniQuery(select(value));
        }

        if (value == global || value == document || value && value.nodeType) {
            return new MiniQuery([value]);
        }

        return new MiniQuery([]);
    }

    MiniQuery.prototype.ready = function (handler) {
        ready(handler);
        return this;
    };

    MiniQuery.prototype.height = function () {
        if (this.elements[0] == global) {
            return global.innerHeight;
        }

        return this.elements[0] ? this.elements[0].clientHeight : 0;
    };

    MiniQuery.prototype.width = function () {
        if (this.elements[0] == global) {
            return global.innerWidth;
        }

        return this.elements[0] ? this.elements[0].clientWidth : 0;
    };

    MiniQuery.prototype.each = function (handler) {
        this.elements.forEach(function (element, index) {
            handler.call(element, index, element);
        });

        return this;
    };

    MiniQuery.prototype.on = function (eventName, handler) {
        return this.each(function () {
            this.addEventListener(eventName, function (event) {
                var result = handler.call(this, event);
                if (result === false) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            });
        });
    };

    MiniQuery.prototype.click = function (handler) {
        return this.on("click", handler);
    };

    MiniQuery.prototype.dblclick = function (handler) {
        return this.on("dblclick", handler);
    };

    MiniQuery.prototype.delay = function (duration) {
        return this.each(function () {
            enqueue(this, function () {
                return wait(duration);
            });
        });
    };

    MiniQuery.prototype.animate = function (properties, duration) {
        return this.each(function () {
            var element = this;
            enqueue(element, function () {
                setAnimated(element, true);
                return runAnimation(element, properties, duration).then(function () {
                    setAnimated(element, false);
                });
            });
        });
    };

    global.$ = $;
}(window));
