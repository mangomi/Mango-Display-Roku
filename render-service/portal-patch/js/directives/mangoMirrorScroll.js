'use strict';

window.myApp.directive('mangoMirrorScroll', ['$timeout', '$rootScope', function ($timeout, $rootScope) {
  return {
    restrict: 'A',
    transclude: false,
    link: function (parentScope, element, attrs) {
      var destroyed = false;
      var startTimeout;
      var scrollScope;
      var scrollTarget;
      var widgetId;
      var runtimeRegistered = false;
      var unregisterParentDestroy;

      $rootScope.mangoMirrorScrollRuntime =
        $rootScope.mangoMirrorScrollRuntime || {};

      function registerRuntime() {
        if (!widgetId) {
          return;
        }

        var widgetRuntimes =
          $rootScope.mangoMirrorScrollRuntime[widgetId] || [];
        widgetRuntimes.push(cleanup);
        $rootScope.mangoMirrorScrollRuntime[widgetId] = widgetRuntimes;
        runtimeRegistered = true;
      }

      function unregisterRuntime() {
        if (!runtimeRegistered || !widgetId) {
          return;
        }

        var widgetRuntimes =
          $rootScope.mangoMirrorScrollRuntime[widgetId] || [];
        var runtimeIndex = widgetRuntimes.indexOf(cleanup);
        if (runtimeIndex >= 0) {
          widgetRuntimes.splice(runtimeIndex, 1);
        }

        if (widgetRuntimes.length === 0) {
          delete $rootScope.mangoMirrorScrollRuntime[widgetId];
        }
        runtimeRegistered = false;
      }

      function cleanup() {
        if (destroyed) {
          return;
        }
        destroyed = true;

        /* painted mode: this cell is gone - stop advertising it */
        if (window.mmPainted === true && window.mmScrollCells && element && element[0]) {
          var cells = window.mmScrollCells;
          for (var cellIndex = cells.length - 1; cellIndex >= 0; cellIndex--) {
            if (cells[cellIndex].el === element[0]) {
              cells.splice(cellIndex, 1);
            }
          }
        }

        if (startTimeout) {
          $timeout.cancel(startTimeout);
          startTimeout = null;
        }

        if (scrollTarget) {
          scrollTarget.stop(true, false);
          scrollTarget.css({ top: 0 });
        }

        unregisterRuntime();

        if (scrollScope && !scrollScope.$$destroyed) {
          scrollScope.$destroy();
        }

        if (unregisterParentDestroy) {
          unregisterParentDestroy();
          unregisterParentDestroy = null;
        }

        element.off('$destroy', cleanup);
        if (element[0]) {
          delete element[0].__mangoMirrorScrollCleanup;
        }
      }

      if (element[0]) {
        element[0].__mangoMirrorScrollCleanup = cleanup;
      }
      unregisterParentDestroy = parentScope.$on('$destroy', cleanup);
      element.on('$destroy', cleanup);

      startTimeout = $timeout(function () {
        startTimeout = null;
        if (destroyed || !element[0] || !document.documentElement.contains(element[0])) {
          cleanup();
          return;
        }

        scrollScope = parentScope.$new(true);
        var wrapperClass = '--mangoMirrorScroll';

        if (typeof attrs.date !== 'undefined') {
          var day = attrs.date.split('-');
          wrapperClass = '--mangoMirrorScroll-' + day[2];
        }

        scrollScope.scrollOption = parentScope.$eval(attrs.mangoMirrorScroll);
        if (!scrollScope.scrollOption) {
          cleanup();
          return;
        }

        var innerClass = scrollScope.scrollOption.childClass;
        var parentClass = scrollScope.scrollOption.parentClass;
        widgetId = scrollScope.scrollOption.id;
        var widgetType = scrollScope.scrollOption.widgetType;
        var elementNode = element[0];
        var firstChild = elementNode.firstElementChild;

        if (!firstChild) {
          cleanup();
          return;
        }

        registerRuntime();
        element.addClass(wrapperClass);

        var elementTarget = $(elementNode);
        scrollTarget = elementTarget.find('.' + innerClass);
        scrollTarget.css({ position: 'relative', visibility: 'inherit' });

        var boxHeight = element.height();
        var innerHeight = firstChild.scrollHeight;

        if (typeof attrs.date !== 'undefined') {
          boxHeight = Math.round(
            element.height() -
              angular.element(firstChild.firstElementChild).height() -
              1
          );
          if (boxHeight <= 0) {
            boxHeight = 0;
          }
          innerHeight = Math.round(firstChild.children[1].scrollHeight);
        }

        if (boxHeight >= innerHeight) {
          element.removeClass(wrapperClass);
          cleanup();
          return;
        }

        var parentTarget = elementTarget.hasClass(parentClass)
          ? elementTarget
          : elementTarget.find('.' + parentClass);
        parentTarget.addClass('-m-scroll-p');

        if (
          scrollScope.scrollOption.isMultiMonth !== undefined &&
          scrollScope.scrollOption.isMultiMonth === true
        ) {
          angular.element(firstChild.children[1]).css({
            height: boxHeight < innerHeight ? boxHeight : innerHeight,
          });
        } else {
          parentTarget.css({
            height: boxHeight < innerHeight ? boxHeight : innerHeight,
          });
        }

        scrollTarget.addClass('-m-scroll-c');

        /* Publishes this cell's marquee to painted mode. No-op for every
         * ordinary display: window.mmPainted is only ever set by the
         * render service's own portal session. */
        function mmPaintedScroll(state, durationMs) {
          if (window.mmPainted !== true) {
            return;
          }
          if (!window.mmScrollCells) {
            window.mmScrollCells = [];
          }
          var list = window.mmScrollCells;
          for (var i = list.length - 1; i >= 0; i--) {
            if (list[i].el === elementNode || !document.documentElement.contains(list[i].el)) {
              list.splice(i, 1);
            }
          }
          if (state !== 'run' || destroyed) {
            return;
          }
          list.push({
            el: elementNode,
            content: scrollTarget && scrollTarget[0] ? scrollTarget[0] : null,
            date: typeof attrs.date !== 'undefined' ? attrs.date : null,
            widgetId: widgetId,
            widgetType: widgetType,
            speed: scrollScope.scrollOption.scrolling,
            boxHeight: boxHeight,
            innerHeight: innerHeight,
            durationMs: durationMs,
          });
        }

        function autoScrollUp() {
          if (
            destroyed ||
            !elementNode ||
            !document.documentElement.contains(elementNode)
          ) {
            cleanup();
            return;
          }

          boxHeight = element.height();
          var speed = 20000;
          var totalHeight = boxHeight + innerHeight;

          if (
            widgetType === 'List' ||
            widgetType === undefined ||
            widgetType === 'todo' ||
            widgetType === 'chores' ||
            widgetType === 'Monthly'
          ) {
            if (scrollScope.scrollOption.scrolling === 'Fast') {
              speed = totalHeight * 19;
            } else if (scrollScope.scrollOption.scrolling === 'Slow') {
              speed = totalHeight * 35;
            }
          }

          scrollTarget.stop(true, false);
          if (scrollScope.scrollOption.scrolling === 'Off') {
            scrollTarget.css({ top: 0, scrollBehavior: 'smooth' });
            mmPaintedScroll('off', 0);
            return;
          }

          /* Painted mode: a TV cannot scroll - it shows a photograph of
           * this page. Publish what this marquee is doing so the render
           * service can film it and hand the device a sprite that moves
           * identically. Everything it needs is already computed here;
           * inferring it from outside is guesswork that misses cells. */
          mmPaintedScroll('run', speed);

          scrollTarget
            .css({ top: boxHeight, scrollBehavior: 'smooth' })
            .animate({ top: -innerHeight }, speed, 'linear', autoScrollUp);
        }

        autoScrollUp();
      }, 200);
    },
  };
}]);
