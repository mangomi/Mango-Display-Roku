window.myApp.controller("MainCtrl", [
  "$scope",
  '$document',
  "$uibModal",
  "$rootScope",
  "$compile",
  "$timeout",
  "$interval",
  "$window",
  "APIServices",
  "colorUtilsService",
  "mediaCache",
  "$localStorage",
  "dateFilter",
  "$sce",
  "$sanitize",
  "$state",
  "$http",
  "$animate",
  "$q",
  "$filter",
  "$parse",
  "$location",
  "$stateParams",
  "MANGO_MIRROR_CONSTANT",
  "MANGO_MIRROR_CONSTANT_ERROR_MESSAGES",
  "$element",

  function (
    $scope,
    $document,
    $uibModal,
    $rootScope,
    $compile,
    $timeout,
    $interval,
    $window,
    APIServices,
    colorUtilsService,
    mediaCache,
    $localStorage,
    dateFilter,
    $sce,
    $sanitize,
    $state,
    $http,
    $animate,
    $q,
    $filter,
    $parse,
    $location,
    $stateParams,
    MANGO_MIRROR_CONSTANT,
    MANGO_MIRROR_CONSTANT_ERROR_MESSAGES,
    $element
  ) {
	
	const AUDIO_BASE_URL = "https://displaytemplates.s3.us-east-1.amazonaws.com/media/silkbrowser/echoshow_media.mp3";
    $scope.fullCalendarMap = {};
    $rootScope.isAppInBackground = false;
    $scope.choresErrorMessage = "";
    $scope.selectedChoresAvatarElement = null;
    $scope.selectedFamilyLabel = null;
    $scope.deselectChoresTimer = null;
    $scope.displayDataRefreshTimeOut = null;
    $scope.displayDataRefreshTimeOutInterval = 0;
    $scope.isDataLoadedThroughSocket = false;
    $scope.bgImageAppleAccessValid = true;
    $scope.dynamic_iframe_url = null;
    //edit calendar variables
    $scope.tolerance = 20;
    $scope.overlaySetting = undefined;
    $scope.calendarAccounts = [];
    $scope.todoAccounts = [];
    $scope.todoAccountsError = null;
    $scope.pendingTodoWidgetSettingId = 0;
    $scope.currentlyEditWidgetSettingId = 0;
    $scope.editTimeout = 10;
    $scope.isEditInprogress = false;
    $scope.loadingMessage = "Loading...";
    $scope.eventDetailsInprogress = false;
    $scope.todoTaskDetailsInprogress = false;
    $scope.isDefaultVideo = false;
    $scope.defaultVideoSrc = "";
    $scope.audioUrl = "";
    $scope.currentOrientation = 0;
    $scope.fvTimer = undefined;
    $scope.hasUnlocked = false;

    //edit calendar variables declaration end
    $scope.userMirrorId = 0;
    $scope.calendarGestureLimit = false;
    $scope.fullpageLoaded = false;
    $scope.reverseTimeout = "";
    $rootScope.isCustomTransition = false;
    $scope.bgImageTransition = false;
    $scope.deviceCodeInvalid = false;
    $scope.displayAnimation = "";
    $scope.isBgEnabled = false;
    $rootScope.scrollingObject = [];
    $scope.themeName = "sketchy";
    $scope.launchChrome = true;
    $scope.isMirrorReset = false;
    $scope.calendarCharacterLength = 30;
    $scope.counter = 0;
    $scope.current = false;
    $scope.index = -1;
    $scope.heightLimit = "";
    $scope.scroll = false;
    $scope.bodyRange = false;
    $scope.showmessage = true;
    $scope.socketMessage = "";
    $scope.messageFlag = true;
    $scope.connectionFlag = true;
    $scope.checkUrlValueFlag = false;
    $scope.loading = true;
    $scope.clockMessageStatus = false;
    $scope.quotesFont = "";
    // $scope.calendarTitle = '';
    $scope.major = "";
    $scope.minor = "";
    $scope.macaddress = "";
    $scope.userId = "";
    $scope.transitionPage = "";
    $scope.quoteIndex = 0;
    $scope.pageCounter = 0;
    $scope.groups = [];
    $scope.temppgroups = [];
    $scope.news = [];
    $scope.listCalendarEvents = [];
    $scope.pinnedWidgetId;
    $scope.goalFailureIcon = "";
    $scope.goalSuccessIcon = "";
    var pageTimeout;
    var taskSocket;
    var getWidgetSetting = "";
    var wakeLockSentinel = null;
    $scope.contentSize = [];
    $scope.contentDataSize = [];
    $scope.contentSizeObject = {};
    $scope.resizeIndex = 0;
    $scope.automaticallyResizeContent = [];
    $scope.newsWithDataArray = {};
    $scope.calendarViewType = undefined;
    $scope.isPreviewModeEnabled = false;
    $scope.isScreenShotEnabled = false;
    $scope.displayStyle = {
      color: "#212529",
      fontFamily: "Open Sans",
    };
    $scope.textColor = "#AAAAAA";

    /* clock variable */
    $scope.clockWidgetList = [];
    
    /* powerbi variable */
    $scope.powerBiWidgetList = [];

    /* quotes variable */
    $scope.quoteWidgetList = [];
    $scope.quotesInterval = undefined;

    /* quotes variable */
    $scope.newsWidgetList = [];
    $scope.newsInterval = undefined;

    /* weather variable */
    $scope.weatherWidgetList = [];
    $scope.weatherInterval = undefined;
    $scope.resizeTimeout = undefined;

    $scope.isBackgroundImageInitialized = false;

    /* no ble data update */
    $scope.isCurrentWeatherOn = false;
    $scope.isDailyWeatherOn = false;
    $scope.is24HourWeatherOn = false;
    $scope.noBleDataUpdateTimeInterval = "";

    /* Background image variables */
    $scope.imgOrintation;
    $scope.unsplashImageSearchKey;
    $scope.unsplashPageNo = 1;
    $scope.imgPerPageCount = 1;
    $scope.applePhotos = [];
    $scope.imgCnt = 1;
    $scope.cropToFitStatus = false;
    $scope.multipleImagesDelayTime = 0;
    $scope.imageTimeOut;
    $scope.imageCounter = 0;
    $scope.isCropToFillMultipleImages = false;
    $scope.watchCropToFitStatus = false;
    $scope.watchMultipleImagesStatus = false;
    $scope.imageFadeInOut;
    $scope.allPhotos = [];

    $scope.imageBrightness;
    $scope.backgroundImageObj;
    $scope.applePhotoURL;
    $scope.unsplashUserName;
    $scope.unsplashName;
    //							$scope.background_googleMediaItems;
    $scope.background_s3Data;

    $scope.isResponseStatus = false;
    $scope.randomCount = 0;
    $scope.isBackgroundImage = false;
    $scope.unsplashCollectionKeyList = [];
    $scope.watchImageCallStatus = false;
    $scope.isFireTvApp = false;
    $scope.unsplashPhotoUrl;

    $scope.isInterNetAvailable = true;

    /* Background image variables end here */

    $scope.calendarUpdateTimeout = undefined;
    $scope.updateNewsIndexInterval;
    $scope.socketStatus = false;
    $scope.socketIntervalTimeout = undefined;
    $scope.calendarScrollIntervalFlag = undefined;
    $scope.calendarScrollTimeoutFlag = undefined;
    $scope.calendarEventArray = {};
    $scope.maxCalendarEventForADay = 0;
    $scope.current_monthlycalendar_iterartion = 0;
    $scope.numberOfEventShowInSingleTime = 0;
    $scope.calendar_render_object = undefined;
    var lagendDisplayStatus = false;
    var lagendreverseOrder = false;
    var lagendPointerIcon = false;

    $scope.calendarWidgetList = [];
    $scope.icalCalendarWidgetList = [];
    $scope.icalAccountList = [];

    $scope.choresWidgetList = [];
    $scope.choresAccountList = [];
    
    $scope.todoWidgetList = [];

    $scope.timeZoneId = "";
    $scope.icalCalendarList = [];
    $scope.icalInterval = undefined;
    $scope.imageWidgetList = [];
    $scope.gifWidgetList = [];
    $scope.fullcalendarObjectList = [];
    $rootScope.authToken;
    $scope.imageRefreshTimeout;
    $scope.calendarRefreshTimeout = [];

    //iframily details
    $scope.iframilyWidgetList = [];

    /* icloud fixes*/
    $scope.bg_lastShownImage = "";

    /* error message fixes*/
    $scope.error_message = "";
    $scope.icalWidgetInterval = [];
    /*todo widget*/
    $scope.todoRefreshTimeout = [];
    $scope.todoWidgetInterval = [];
    $scope.countdownWidgetInterval = [];
    $scope.choresWidgetInterval = [];
    $scope.displayName = "";
    // gesture object
    $scope.gesture;

    //todo autocomplete
    $scope.todoAutoComplete = undefined;

    //token
    $scope.previewToken = undefined;
    
    // browser snapshot
    $scope.snapshotList = [];
    $scope.snapShotWidgetList = [];
    
    // child display
    $scope.isChildDisplay = false;

    // is new firetv
    $scope.is_frv = false;

    var userAgent = window.navigator.userAgent.toLowerCase();
    var previewUrlParams = new URLSearchParams(window.location.search);
    var isPreviewUrl = previewUrlParams.get("preview") === "true";
    $scope.storedDeviceHeight =
      (isPreviewUrl
        ? Number(previewUrlParams.get("deviceHeight"))
        : Number($window.localStorage.getItem("storedDeviceHeight"))) ||
      0;
    $scope.storedDeviceWidth =
      (isPreviewUrl
        ? Number(previewUrlParams.get("deviceWidth"))
        : Number($window.localStorage.getItem("storedDeviceWidth"))) ||
      0;
    $scope.isFitToDeviceEnabled = previewUrlParams.get("fitToDevice") === "true";
    /* Web Live Designer: the layout editor embeds this page as a live
     * underlay (designer=true). Independent of the preview flow — it reuses
     * the same display protections but shows no banner, no page navigator,
     * and pins to the page the editor is on (page=N, zero-based). */
    $scope.isDesignerModeEnabled =
      previewUrlParams.has("designer") &&
      previewUrlParams.get("designer") === "true";
    /* Painted mode: a native client (Roku today, tvOS next) runs this
     * portal LIVE in a headless browser, screenshots it, and paints the
     * moving parts itself. Unlike preview/designer this keeps the real
     * socket, the real timers and the real reloads - the portal behaves
     * exactly like a display, and simply announces when it has finished
     * redrawing so the client knows when a screenshot is worth taking.
     * Media suppression lives in js/service/paintedMode.js. */
    $scope.isPaintedModeEnabled = previewUrlParams.get("painted") === "true";
    /* everything painted mode does lives in js/service/paintedMode.js;
     * it just needs the scope once to drive paging. showNextPage rides
     * along (hoisted function declaration, so it exists here) because
     * quoteIndex alone only moves bindings - page visibility and z-order
     * are applied imperatively by showNextPage, and stepping pages
     * without it leaves the old page on screen. */
    if ($scope.isPaintedModeEnabled === true && window.mmPaintedBridge) {
      window.mmPaintedBridge($scope, $timeout, showNextPage);
    }
    var designerPageParam = Number(previewUrlParams.get("page"));
    $scope.designerPageIndex =
      $scope.isDesignerModeEnabled &&
      !isNaN(designerPageParam) &&
      designerPageParam > 0
        ? designerPageParam
        : 0;
    $scope.getPageTransitionClass = function (page) {
      if ($scope.isDesignerModeEnabled === true) {
        return "fade";
      }
      return page && page.transition ? page.transition : "";
    };
    $scope.isRenderablePage = function (page) {
      return !(
        page &&
        (page.isPageBlank === true || page.isPageBlank === "true")
      );
    };
    $scope.postDesignerPageStatus = function (page, isPageBlank) {
      if ($scope.isDesignerModeEnabled !== true || window.parent === window) {
        return;
      }
      try {
        window.parent.postMessage(
          {
            type: "mm-designer-page-status",
            isPageBlank: isPageBlank === true,
            page: $scope.designerPageIndex,
            pageIndex: $scope.designerPageIndex,
            pageNumber: $scope.designerPageIndex + 1,
            pageId: page && page.pageId,
          },
          "*"
        );
      } catch (e) {}
    };
    $scope.clearBackgroundImageLayers = function () {
      var bgLayer1 = document.getElementById("bg_img_1");
      var bgLayer2 = document.getElementById("bg_img_2");
      if (bgLayer1) {
        bgLayer1.style.background = "url()";
      }
      if (bgLayer2) {
        bgLayer2.style.background = "url()";
      }
    };
    $scope.clearDesignerBackgroundIfDisabled = function () {
      if ($scope.isDesignerModeEnabled !== true) {
        return;
      }
      var pinnedPage = $scope.groups && $scope.groups[$scope.quoteIndex];
      if (!(pinnedPage && pinnedPage.isBackgroundImage)) {
        $scope.clearBackgroundImageLayers();
      }
    };
    $scope.getRenderablePageCount = function () {
      var count = 0;
      angular.forEach($scope.groups, function (page) {
        if ($scope.isRenderablePage(page)) {
          count++;
        }
      });
      return count;
    };
    $scope.getRenderablePageIndex = function (startIndex, direction) {
      if (!$scope.groups || $scope.groups.length === 0) {
        return 0;
      }

      var step = direction === -1 ? -1 : 1;
      var totalPages = $scope.groups.length;
      var index = ((startIndex % totalPages) + totalPages) % totalPages;

      for (var i = 0; i < totalPages; i++) {
        if ($scope.isRenderablePage($scope.groups[index])) {
          return index;
        }
        index = (index + step + totalPages) % totalPages;
      }

      return $scope.quoteIndex >= 0 && $scope.quoteIndex < totalPages
        ? $scope.quoteIndex
        : 0;
    };
    var renderablePageNavigationCache = {
      signature: "",
      items: [],
    };
    $scope.getRenderablePageNavigationItems = function () {
      if (!$scope.groups || $scope.groups.length === 0) {
        renderablePageNavigationCache.signature = "";
        renderablePageNavigationCache.items = [];
        return renderablePageNavigationCache.items;
      }

      var signatureParts = [];
      angular.forEach($scope.groups, function (page, index) {
        signatureParts.push(
          index +
            ":" +
            (page && page.pageId ? page.pageId : "") +
            ":" +
            (page && page.isPageBlank)
        );
      });
      var signature = signatureParts.join("|");
      if (signature === renderablePageNavigationCache.signature) {
        return renderablePageNavigationCache.items;
      }

      var items = [];
      angular.forEach($scope.groups, function (page, index) {
        if ($scope.isRenderablePage(page)) {
          items.push({
            page: page,
            index: index,
          });
        }
      });

      renderablePageNavigationCache.signature = signature;
      renderablePageNavigationCache.items = items;
      return renderablePageNavigationCache.items;
    };
    $scope.getRuntimeViewportSize = function () {
      var runtimeHeight =
        window.innerHeight !== undefined && Number(window.innerHeight) > 0
          ? Number(window.innerHeight)
          : Number(window.screen && window.screen.height);
      var runtimeWidth =
        window.innerWidth !== undefined && Number(window.innerWidth) > 0
          ? Number(window.innerWidth)
          : Number(window.screen && window.screen.width);
      return {
        height: !isNaN(runtimeHeight) && runtimeHeight > 0 ? runtimeHeight : 0,
        width: !isNaN(runtimeWidth) && runtimeWidth > 0 ? runtimeWidth : 0,
      };
    };
    $scope.applyBodyDimensionsForCurrentMode = function () {
      var wv = /wv/.test(userAgent);
      var runtimeViewportSize = $scope.getRuntimeViewportSize();
      var shouldUseFitToDeviceDimensions =
        $scope.isPreviewModeEnabled === true &&
        $scope.isFitToDeviceEnabled === true;

      if ($scope.isPreviewModeEnabled === true) {
        if (shouldUseFitToDeviceDimensions) {
          $scope.bodyHeight = runtimeViewportSize.height;
          $scope.bodyWidth = runtimeViewportSize.width;
        } else {
          $scope.bodyHeight =
            $scope.storedDeviceHeight > 0
              ? $scope.storedDeviceHeight
              : runtimeViewportSize.height;
          $scope.bodyWidth =
            $scope.storedDeviceWidth > 0
              ? $scope.storedDeviceWidth
              : runtimeViewportSize.width;
        }
        return;
      }

      if (wv == false) {
        if (window.innerWidth !== undefined && window.innerHeight !== undefined) {
          $scope.bodyHeight = window.innerHeight;
          $scope.bodyWidth = window.innerWidth;
        }
      } else {
        if (
          window.screen.height !== undefined &&
          window.screen.width !== undefined
        ) {
          $scope.bodyHeight = window.innerHeight;
          $scope.bodyWidth = window.innerWidth;
        }
      }
    };
    $scope.toggleFitToDevice = function (event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (!($scope.isPreviewModeEnabled === true)) {
        return;
      }
      var url = new URL(window.location.href);
      if ($scope.isFitToDeviceEnabled) {
        url.searchParams.delete("fitToDevice");
      } else {
        url.searchParams.set("fitToDevice", "true");
      }
      window.location.href = url.toString();
    };
    $scope.isGestureFeatureEnabled = true;
    $scope.shouldDisableGestureAndClickEvents = function () {
      return (
        $scope.isPreviewModeEnabled === true &&
        $scope.isFitToDeviceEnabled === false
      );
    };
    $scope.shouldAutoRotatePages = function () {
      return (
        /* the native client steps pages itself via mmScreenshot.gotoPage
         * so it can capture each one; a portal rotating underneath it
         * would race those captures */
        $scope.isPaintedModeEnabled !== true &&
        $scope.shouldDisableGestureAndClickEvents() === false &&
        $scope.getRenderablePageCount() > 1 &&
        $scope.groups[$scope.quoteIndex] &&
        $scope.isRenderablePage($scope.groups[$scope.quoteIndex]) &&
        $scope.groups[$scope.quoteIndex].isAutoPageRotation == true
      );
    };
    $scope.updateGestureFeatureState = function () {
      $scope.isGestureFeatureEnabled =
        !$scope.shouldDisableGestureAndClickEvents();
      $timeout(function () {
        $scope.updatePreviewScrollState();
      }, 0);
    };
    $scope.updatePreviewScrollState = function () {
      var shouldEnableScroll = $scope.shouldDisableGestureAndClickEvents();
      var previewHeight = Number($scope.bodyHeight);
      var previewWidth = Number($scope.bodyWidth);
      var screenHeight =
        window.innerHeight !== undefined && Number(window.innerHeight) > 0
          ? Number(window.innerHeight)
          : previewHeight;
      var screenWidth =
        window.innerWidth !== undefined && Number(window.innerWidth) > 0
          ? Number(window.innerWidth)
          : previewWidth;
      var requiresScroll =
        shouldEnableScroll &&
        (previewHeight > screenHeight || previewWidth > screenWidth);

      var mainOverflowYValue = requiresScroll ? "auto" : "hidden";
      var mainOverflowXValue = requiresScroll ? "auto" : "hidden";
      var containerOverflowValue = "hidden";
      var hasPreviewBounds =
        !isNaN(previewHeight) &&
        !isNaN(previewWidth) &&
        previewHeight > 0 &&
        previewWidth > 0;
      var boundedHeight = hasPreviewBounds ? previewHeight + "px" : "";
      var boundedWidth = hasPreviewBounds ? previewWidth + "px" : "";

      if (document && document.documentElement) {
        document.documentElement.style.overflowY = containerOverflowValue;
        document.documentElement.style.overflowX = containerOverflowValue;
      }
      if (document && document.body) {
        document.body.style.overflowY = containerOverflowValue;
        document.body.style.overflowX = containerOverflowValue;
      }

      var appElement = document.getElementById("app");
      if (appElement) {
        appElement.style.overflowY = containerOverflowValue;
        appElement.style.overflowX = containerOverflowValue;
      }

      var bodyElement = document.getElementById("body");
      if (bodyElement) {
        bodyElement.style.overflowY = containerOverflowValue;
        bodyElement.style.overflowX = containerOverflowValue;
      }

      var mainElement = document.getElementById("main");
      if (mainElement) {
        mainElement.style.position = "relative";
        mainElement.style.boxSizing = "border-box";
        mainElement.style.overflowY = mainOverflowYValue;
        mainElement.style.overflowX = mainOverflowXValue;
        if (hasPreviewBounds) {
          if (requiresScroll) {
            mainElement.style.height = screenHeight + "px";
            mainElement.style.width = screenWidth + "px";
            mainElement.style.minHeight = screenHeight + "px";
            mainElement.style.minWidth = screenWidth + "px";
            mainElement.style.maxHeight = screenHeight + "px";
            mainElement.style.maxWidth = screenWidth + "px";
          } else {
            mainElement.style.height = boundedHeight;
            mainElement.style.width = boundedWidth;
            mainElement.style.minHeight = boundedHeight;
            mainElement.style.minWidth = boundedWidth;
            mainElement.style.maxHeight = boundedHeight;
            mainElement.style.maxWidth = boundedWidth;
          }
        }

        var previewBanner = document.getElementById("preview-banner");
        if (previewBanner) {
          if (requiresScroll) {
            var bannerHeight = previewBanner.offsetHeight || 40;
            previewBanner.style.top =
              Math.max(0, previewHeight - bannerHeight) + "px";
            previewBanner.style.bottom = "auto";
            previewBanner.style.width = boundedWidth;
          } else {
            previewBanner.style.top = "auto";
            previewBanner.style.bottom = "0";
            previewBanner.style.width = "100%";
          }
        }

        if (!$scope.previewScrollLimitHandler) {
          $scope.lastPreviewScrollDebug = null;
          $scope.computePreviewContentBounds = function (rootElement, minWidth, minHeight) {
            var contentWidth = minWidth;
            var contentHeight = minHeight;
            var rootRect = rootElement.getBoundingClientRect();
            var candidates = rootElement.querySelectorAll(
              "#pageTransition .box, #pageTransition .widgetList, #pageTransition > div, #pageTransition"
            );

            for (var i = 0; i < candidates.length; i++) {
              var node = candidates[i];
              var rect = node.getBoundingClientRect();
              if (rect.width <= 0 && rect.height <= 0) {
                continue;
              }
              var right =
                rect.right - rootRect.left + rootElement.scrollLeft;
              var bottom =
                rect.bottom - rootRect.top + rootElement.scrollTop;
              if (right > contentWidth) {
                contentWidth = right;
              }
              if (bottom > contentHeight) {
                contentHeight = bottom;
              }
            }

            contentWidth = Math.max(contentWidth, rootElement.scrollWidth);
            contentHeight = Math.max(contentHeight, rootElement.scrollHeight);
            return {
              width: Math.ceil(contentWidth),
              height: Math.ceil(contentHeight),
            };
          };

          $scope.previewScrollLimitHandler = function () {
            var limitHeight = Number($scope.bodyHeight);
            var limitWidth = Number($scope.bodyWidth);
            if (
              isNaN(limitHeight) ||
              isNaN(limitWidth) ||
              limitHeight <= 0 ||
              limitWidth <= 0
            ) {
              return;
            }
            var runtimeScreenHeight =
              window.innerHeight !== undefined && Number(window.innerHeight) > 0
                ? Number(window.innerHeight)
                : limitHeight;
            var runtimeScreenWidth =
              window.innerWidth !== undefined && Number(window.innerWidth) > 0
                ? Number(window.innerWidth)
                : limitWidth;
            var maxTop = Math.max(0, limitHeight - runtimeScreenHeight);
            var maxLeft = Math.max(0, limitWidth - runtimeScreenWidth);

            var debugSnapshot =
              runtimeScreenWidth +
              "|" +
              limitWidth +
              "|" +
              maxLeft +
              "|" +
              runtimeScreenHeight +
              "|" +
              limitHeight +
              "|" +
              maxTop;
            if ($scope.lastPreviewScrollDebug !== debugSnapshot) {
              $scope.lastPreviewScrollDebug = debugSnapshot;
              console.log("[preview-scroll-debug]", {
                screenWidth: runtimeScreenWidth,
                bodyWidth: limitWidth,
                maxLeft: maxLeft,
                screenHeight: runtimeScreenHeight,
                bodyHeight: limitHeight,
                maxTop: maxTop,
                requiresScroll: limitHeight > runtimeScreenHeight || limitWidth > runtimeScreenWidth,
                scrollLeft: mainElement.scrollLeft,
                scrollTop: mainElement.scrollTop,
              });
            }

            if (mainElement.scrollTop < 0) {
              mainElement.scrollTop = 0;
            } else if (mainElement.scrollTop > maxTop) {
              mainElement.scrollTop = maxTop;
            }
            if (mainElement.scrollLeft < 0) {
              mainElement.scrollLeft = 0;
            } else if (mainElement.scrollLeft > maxLeft) {
              mainElement.scrollLeft = maxLeft;
            }
          };
        }

        if (requiresScroll) {
          if (!mainElement.__previewScrollBound) {
            mainElement.addEventListener(
              "scroll",
              $scope.previewScrollLimitHandler,
              { passive: true }
            );
            mainElement.__previewScrollBound = true;
          }
          $scope.previewScrollLimitHandler();
        } else if (mainElement.__previewScrollBound) {
          mainElement.removeEventListener(
            "scroll",
            $scope.previewScrollLimitHandler
          );
          mainElement.__previewScrollBound = false;
        }

        if (requiresScroll) {
          mainElement.style.webkitOverflowScrolling = "touch";
        } else {
          mainElement.style.webkitOverflowScrolling = "";
          mainElement.scrollTop = 0;
          mainElement.scrollLeft = 0;
        }
      }
    };
    $scope.updateGestureFeatureState();
    var blockedInteractionEvents = [
      "click",
      "dblclick",
      "mousedown",
      "mouseup",
    ];
    var isPageNavigationButtonTarget = function (event) {
      if (!event || !event.target) {
        return false;
      }

      var target = event.target;
      if (target.nodeType === 3) {
        target = target.parentElement;
      }

      if (!target) {
        return false;
      }

      if (typeof target.closest === "function") {
        return (
          target.closest(".page-nav-button") !== null ||
          target.closest(".preview-fit-button") !== null
        );
      }

      var currentTarget = target;
      while (currentTarget && currentTarget !== document) {
        if (
          currentTarget.classList &&
          (currentTarget.classList.contains("page-nav-button") ||
            currentTarget.classList.contains("preview-fit-button"))
        ) {
          return true;
        }
        currentTarget = currentTarget.parentElement;
      }

      return false;
    };
    var blockInteractionWhenGestureDisabled = function (event) {
      if ($scope.shouldDisableGestureAndClickEvents() === false) {
        return;
      }
      if (isPageNavigationButtonTarget(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) {
        event.stopImmediatePropagation();
      }
    };
    angular.forEach(blockedInteractionEvents, function (eventName) {
      document.addEventListener(
        eventName,
        blockInteractionWhenGestureDisabled,
        true
      );
    });
    $scope.$on("$destroy", function () {
      angular.forEach(blockedInteractionEvents, function (eventName) {
        document.removeEventListener(
          eventName,
          blockInteractionWhenGestureDisabled,
          true
        );
      });
    });
    var wv = /wv/.test(userAgent);
    $scope.clickTimer = null;

    $scope.applyBodyDimensionsForCurrentMode();

    $scope.sendAutoLog = function (subject, message) {
      $scope.AutologData = {
        autosubmit: true,
        body: message,
        subject: subject,
      };
      APIServices.sendAutoLog($scope.AutologData)
        .success(function (data, status) {
          console.log("log submitted successfully");
        })
        .error(function (data, status) {
          console.log("There are some issues while submitting logs");
        });
    };

    $scope.isTargetWakeLockDevice = function () {
      return (
        $scope.macaddress === "AN343478298" ||
        $scope.macaddress === "AN664118436"
      );
    };

    $scope.isScreenWakeLockSupported = function () {
      return (
        "wakeLock" in navigator &&
        navigator.wakeLock &&
        typeof navigator.wakeLock.request === "function"
      );
    };

    $scope.shouldEnableScreenWakeLock = function () {
      return (
        $scope.isTargetWakeLockDevice() &&
        $scope.isScreenWakeLockSupported()
      );
    };

    $scope.requestScreenWakeLock = function () {
      if (!$scope.isTargetWakeLockDevice()) {
        return;
      }
      if (!$scope.isScreenWakeLockSupported()) {
        console.log("Screen Wake Lock API is not supported on this browser.");
        return;
      }
      if (document.visibilityState !== "visible" || wakeLockSentinel) {
        return;
      }

      navigator.wakeLock.request("screen")
        .then(function (sentinel) {
          wakeLockSentinel = sentinel;
          wakeLockSentinel.addEventListener("release", function () {
            wakeLockSentinel = null;
          });
        })
        .catch(function (error) {
          console.log("Unable to request screen wake lock", error);
        });
    };

    $scope.releaseScreenWakeLock = function () {
      if (wakeLockSentinel) {
        wakeLockSentinel.release();
        wakeLockSentinel = null;
      }
    };

    /*
     * =======================fetch url data and store
     * it into local
     * storage==========================================
     */
    $scope.init = function () {
      try {
        var isPreviewEnabled = $location.search().preview;
        $scope.isScreenShotEnabled = $location.search().screenshot;
        if (
          isPreviewEnabled != undefined &&
          isPreviewEnabled == "true" &&
          ($scope.isScreenShotEnabled == undefined ||
            ($scope.isScreenShotEnabled != undefined &&
              $scope.isScreenShotEnabled == "false"))
        ) {
          $scope.isPreviewModeEnabled = JSON.parse(isPreviewEnabled);
          $timeout(function () {
            document.getElementById("preview-banner").style.display = "flex";
          }, 1000);
        }
        if ($scope.isDesignerModeEnabled === true) {
          /* designer mode reuses the preview protections (no sockets, no
           * TV takeover, gestures/rotation off) WITHOUT the preview banner
           * or token expiry — the block above never runs for designer URLs */
          $scope.isPreviewModeEnabled = true;

          /* the embedding layout editor steers widgets live over
           * postMessage: move streams during a drag, hide/show during a
           * resize. Widget elements are id'd "<widgetSettingId>_<page>". */
          var designerAllowedOrigins = [
            "http://localhost:4200",
            "http://127.0.0.1:4200",
          ];
          try {
            designerAllowedOrigins.push(new URL(webBaseUrl).origin);
          } catch (e) {}
          window.addEventListener("message", function (event) {
            if (designerAllowedOrigins.indexOf(event.origin) === -1) {
              return;
            }
            var msg = event.data;
            if (!msg || typeof msg.type !== "string") {
              return;
            }
            if (msg.type === "mm-designer-inspect") {
              /* QA hook: report every widget's live geometry so the editor
               * (or a test harness) can verify the underlay matches */
              try {
                var report = [];
                Array.prototype.forEach.call(
                  document.querySelectorAll(".box"),
                  function (node) {
                    var rect = node.getBoundingClientRect();
                    report.push({
                      id: node.id,
                      rect: {
                        x: Math.round(rect.left),
                        y: Math.round(rect.top),
                        w: Math.round(rect.width),
                        h: Math.round(rect.height),
                      },
                      styleW: node.style.width,
                      styleH: node.style.height,
                      transform: node.style.transform || "",
                      origW: node.dataset.mmOrigW || "",
                      origH: node.dataset.mmOrigH || "",
                      contentOverflowB: Math.round(
                        node.scrollHeight - node.clientHeight
                      ),
                    });
                  }
                );
                event.source.postMessage(
                  { type: "mm-designer-geometry", widgets: report },
                  event.origin
                );
              } catch (e) {}
              return;
            }
            var el = document.getElementById(
              msg.widgetSettingId + "_" + msg.page
            );
            if (!el) {
              return;
            }
            if (msg.type === "mm-designer-move") {
              el.style.left = Number(msg.x) + "px";
              el.style.top = Number(msg.y) + "px";
            } else if (msg.type === "mm-designer-resize") {
              /* sent ONCE on resize release (not streamed): the container
               * gets its final box and the content reflows into it — an
               * approximation of the real render until the post-save
               * reload replaces the document with the true one */
              /* the content is laid out (fonts, grids, wraps) for the box
               * the DOCUMENT rendered it at — remember that box the first
               * time the editor resizes this widget */
              if (!el.dataset.mmOrigW) {
                el.dataset.mmOrigW = String(el.clientWidth || Number(msg.w));
                el.dataset.mmOrigH = String(el.clientHeight || Number(msg.h));
              }
              /* auto-scale the WHOLE widget subtree to the new box. The
               * transform sits on the container itself so no
               * widget-internal structure can escape it, and it is
               * temporary by construction — the post-save reload replaces
               * the document with the real render (fresh elements start
               * clean). Two modes, chosen by the editor per widget type:
               *
               * "reflow" (text-flow content — quotes, notes): uniform
               * scale by the tighter box ratio, laid out on a box/scale
               * virtual canvas so text re-wraps in the loose dimension
               * and backgrounds fill the whole box.
               *
               * default "stretch" (fixed-pixel content — calendar grids,
               * weather tables): independent x/y scale so the content
               * ALWAYS tracks the box exactly in both dimensions — such
               * content cannot re-wrap, and under "reflow" a mostly
               * one-directional resize has a tighter ratio of ~1 and
               * visibly does nothing. Mild distortion beats no response. */
              var newW = Number(msg.w);
              var newH = Number(msg.h);
              var origW = Math.max(Number(el.dataset.mmOrigW), 1);
              var origH = Math.max(Number(el.dataset.mmOrigH), 1);
              el.style.left = Number(msg.x) + "px";
              el.style.top = Number(msg.y) + "px";
              var sx = newW / origW;
              var sy = newH / origH;
              if (Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) {
                el.style.transform = "";
                el.style.transformOrigin = "";
                el.style.width = newW + "px";
                el.style.height = newH + "px";
              } else if (msg.fit === "reflow") {
                var scale = Math.min(sx, sy);
                el.style.transformOrigin = "top left";
                el.style.transform = "scale(" + scale + ")";
                el.style.width = newW / scale + "px";
                el.style.height = newH / scale + "px";
              } else {
                el.style.transformOrigin = "top left";
                el.style.transform = "scale(" + sx + ", " + sy + ")";
                el.style.width = origW + "px";
                el.style.height = origH + "px";
              }
            } else if (msg.type === "mm-designer-hide") {
              /* opacity, not visibility: widget-internal animation classes
               * (image crossfades) set "visibility: visible" on children,
               * which would override a hidden ancestor. Children can never
               * override an ancestor's opacity. */
              el.style.opacity = "0";
            } else if (msg.type === "mm-designer-show") {
              el.style.opacity = "";
            }
          });
        }
        $scope.applyBodyDimensionsForCurrentMode();
        $scope.updateGestureFeatureState();
        var major = $location.search().major;
        var minor = $location.search().minor;
        var macaddress = $location.search().macaddress;

        $scope.major = major;
        $scope.minor = minor;
        $scope.macaddress = macaddress;
        $localStorage.major = $scope.major;
        $localStorage.minor = $scope.minor;
        $localStorage.macaddress = $scope.macaddress;
        /* nothing to keep awake in a headless browser, and the request
         * needs a user gesture it will never get */
        if ($scope.isPaintedModeEnabled !== true) {
          $scope.requestScreenWakeLock();
        }
        if ($scope.isPreviewModeEnabled == true) {
          $scope.previewToken = $location.search().token;
        }

        $localStorage.userId = "";
        $scope.checkUrlValueFlag = true;

        /* A headless page can be marked hidden at any time; reloading
         * the portal because of that would throw away the live socket and
         * the client's picture with it. */
        if ($scope.isPreviewModeEnabled == false && $scope.isPaintedModeEnabled !== true) {
          document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible") {
              $rootScope.isAppInBackground = false;
              $scope.requestScreenWakeLock();
              if ($scope.currentOrientation === 0) {
                window.location.reload();
              } else {
                var payload = { type: MANGO_MIRROR_CONSTANT.DISPLAY_RESIZED };
                $scope.sendToParent(payload);
              }
            } else if (document.visibilityState === "hidden") {
              $rootScope.isAppInBackground = true;
              setTimeout(() => {
                $interval.cancel($scope.socketIntervalTimeout);
                taskSocket.close();
              }, 5000);
            }
          });
        }
      } catch (e) {
        console.log("can't pick some of data from URL");
      }
    };

    $scope.downloadImage = function (url) {
      $http
        .get(url + "/?client_id=" + MANGO_MIRROR_CONSTANT.UNSPLASH_CLIENT_ID, {
          responseType: "arraybuffer",
        })
        .success(function (data) {
          var anchor = angular.element("<a/>");
          var blob = new Blob([data]);
          anchor
            .attr({
              href: window.URL.createObjectURL(blob),
              target: "_blank",
              download: "unsplashImage.jpeg",
            })[0]
            .click();
        });
    };

    $scope.checkIfGifSettingAdded = function (widgetData) {
      for (var i = 0; i < $scope.gifWidgetList.length; i++) {
        if ($scope.gifWidgetList[i].widgetId == widgetData.widgetSettingId) {
          return true;
        }
      }
      return false;
    };

    $scope.randomizeImage = function (images) {
      return images.sort(() => Math.random() - 0.5);
    };

    $scope.showLoadingMessage = function (id, message, isHidden) {
    	try {
    		var element = document.getElementById(id);
    	      element.innerText = message;
    	      if (isHidden) {
    	        element.style.display = "none";
    	      } else {
    	        element.style.display = "block";
    	      }	
		} catch (e) {
			// TODO: handle exception
			console.log(e);
		}
      
    };

    $scope.initializeImageWidget = function (widgetData, index) {
      if ($scope.checkIfImageSettingAdded(widgetData) == false) {
        $timeout(function () {
          $scope.showLoadingMessage(
            "img_loading_" + widgetData.widgetSettingId + "_" + index,
            "Processing images...",
            false
          );
        }, 100);

        $scope.mapImageData(widgetData, index);
        $scope.loadImagesFromSource(widgetData, true);
      } else {
        for (var i = 0; i < $scope.imageWidgetList.length; i++) {
          if ($scope.imageWidgetList[i].widgetId == widgetData.widgetSettingId) {
            if (!$scope.imageWidgetList[i].pagenumber.includes(index)) {
              $scope.imageWidgetList[i].pagenumber.push(index);
            }
            $scope.restoreImageWidgetState($scope.imageWidgetList[i], index);
          }
        }
      }
    };

    $scope.checkIfImageSettingAdded = function (widgetData) {
      for (var i = 0; i < $scope.imageWidgetList.length; i++) {
        if ($scope.imageWidgetList[i].widgetId == widgetData.widgetSettingId) {
          return true;
        }
      }
      return false;
    };

    $scope.mapImageData = function (widgetData, index) {
      var imageWidget = {
        widgetId: widgetData.widgetSettingId,
        widgetdata: widgetData.data,
        widgetSetting: widgetData,
        widgetBackground: widgetData.widgetBackgroundSettingModel,
        isSingleImagezUrlLoaded: true,
        isIntervalAdded: false,
        images: [],
        googleImage: [],
        appleImage: [],
        appleImageLastAccessTime: null,
        isAppleAccessStillValid: true,
        currentPos: 0,
        pagenumber: [index],
        intervalObject: null,
        isInitialCallHappened: false,
        pageCheck: false,
        toggle: false,
        isAnySourceDataLoaded: false,
        lastRenderedImage: null,
      };

      var imageDelayTime = 60;
      if (widgetData.contentType == "pdf") {
        var iframeData = widgetData.data.iframeDetail;
        imageDelayTime = iframeData.imageDelayTime;
        if (
          iframeData.isCustomUrlEnabled == true &&
          iframeData.isS3Enabled == false
        ) {
          if ($scope.isPreviewModeEnabled == false && $scope.isChildDisplay==false) {
            var pdfTimeout = $timeout(function () {
              $scope.refreshIframeData(iframeData, widgetData.widgetSettingId);
            }, iframeData.autoRefreshTime * 1000);
            imageWidget["timeout"] = pdfTimeout;
          }
        }
      }
      $scope.imageWidgetList.push(imageWidget);
    };

    $scope.restoreImageWidgetState = function (widgetDetail, pageIndex) {
      if (!widgetDetail || !widgetDetail.lastRenderedImage) {
        return;
      }

      var key =
        widgetDetail.widgetSetting.contentType == "pdf" ? "iframily_" : "img_";
      var widgetSetting =
        widgetDetail.widgetSetting.contentType == "pdf"
          ? widgetDetail.widgetdata.iframeDetail
          : widgetDetail.widgetdata.imageWidgetSetting;
      var imageId1 = document.getElementById(
        key + widgetDetail.widgetId + "_" + pageIndex + "_1"
      );
      var imageId2 = document.getElementById(
        key + widgetDetail.widgetId + "_" + pageIndex + "_2"
      );

      if (!imageId1 || !widgetSetting) {
        return;
      }

      $scope.setBackgroundImage(
        imageId1,
        widgetDetail.lastRenderedImage,
        widgetSetting.isCropToFill ? "cover" : "contain",
        widgetSetting.imageBrightness
      );

      if (widgetDetail.widgetBackground.corner == "rounded") {
        imageId1.style.borderRadius =
          widgetDetail.widgetBackground.corner === "rounded" ? "15px" : "0px";
        if (imageId2 != undefined) {
          imageId2.style.borderRadius =
            widgetDetail.widgetBackground.corner === "rounded" ? "15px" : "0px";
        }
      }

      if (imageId2 != undefined) {
        imageId2.classList.remove("image-loaded");
      }
      imageId1.classList.add("image-loaded");

      $timeout(function () {
        $scope.showLoadingMessage(
          "img_loading_" + widgetDetail.widgetId + "_" + pageIndex,
          "Loading .....",
          true
        );
      }, 100);
    };

    $scope.loadImagesFromSource = function (
      widgetData,
      isAppleAccessStillValid
    ) {
      var widgetSetting = "";
      if (widgetData.contentType == "pdf") {
        widgetSetting = widgetData.data.iframeDetail;
      } else {
        widgetSetting = widgetData.data.imageWidgetSetting;
      }
      if (widgetSetting == undefined) {
        return;
      }

      if (
        (widgetSetting.isS3Enabled && widgetData.data.s3Data != null) ||
        (widgetData.data.pdfImages != undefined &&
          widgetData.data.pdfImages.length > 0)
      ) {
        $scope.loadS3Url(widgetData);
      }
      if (
        widgetSetting.isImageUrlEnable &&
        widgetSetting.imageUrlLink != null
      ) {
        $scope.loadSinglePageUrl(widgetData);
      }
      if (
        widgetSetting.isUnsplashImage &&
        widgetData.data.unsplashCollectionKeyList.length > 0
      ) {
        $scope.loadUnsplashPhotos(widgetData);
      }
      if (
        null != widgetSetting.googleSharedAlbumUrl &&
        widgetSetting.isGoogleImage
      ) {
        $timeout(function () {
          var isApiAlreadyCalled = $scope.checkGoogleImageWidgetCalled(
            widgetSetting.googleSharedAlbumUrl
          );
          if (isApiAlreadyCalled == false) {
            $scope.updateGoogleAlbumStatus(widgetSetting.googleSharedAlbumUrl);
          }
          $scope.loadGooglePhotos(widgetData);
        }, 300);
      }

      if (widgetSetting.isDefaultUnsplashImage) {
        $scope.loadDefaultUnsplashPhoto(widgetData);
      }

      if (
        null != widgetSetting.appleAccessToken &&
        widgetSetting.isAppleImage &&
        isAppleAccessStillValid == true
      ) {
        $scope.loadApplePhotos(widgetData);
      }
    };

    $scope.loadDefaultUnsplashPhoto = function (widgetData) {
      try {
        if ($scope.bodyHeight > $scope.bodyWidth) {
          var url1 =
            MANGO_MIRROR_CONSTANT.UNSPLASH_IMAGE_BY_COLLECTION_URL +
            "2600706/photos?client_id=" +
            MANGO_MIRROR_CONSTANT.UNSPLASH_CLIENT_ID;
        } else {
          var url1 =
            MANGO_MIRROR_CONSTANT.UNSPLASH_IMAGE_BY_COLLECTION_URL +
            "2600701/photos?client_id=" +
            MANGO_MIRROR_CONSTANT.UNSPLASH_CLIENT_ID;
        }

        $http({
          method: "GET",
          header: {
            "Content-Type": "application/json",
          },
          url: url1,
        }).then(
          function (res) {
            var totalFound = res.data.length;
            var result = [];
            if (totalFound > 0) {
              for (var i = 0; i < totalFound; i++) {
                var regular = res.data[i].urls.regular;
                result.push(regular);
              }
            }

            angular.forEach($scope.imageWidgetList, function (widgetDetail) {
              if (widgetDetail.widgetId == widgetData.widgetSettingId) {
                widgetDetail.images.push(...$scope.randomizeImage(result));
                /*widgetDetail.images.push(...result);
									        		widgetDetail.images = $scope.randomizeImage(widgetDetail.images);*/

                for (
                  var index = 0;
                  index < widgetDetail.pagenumber.length;
                  index++
                ) {
                  let pageIndex = widgetDetail.pagenumber[index];
                  $timeout(function () {
                    $scope.showLoadingMessage(
                      "img_loading_" +
                        widgetData.widgetSettingId +
                        "_" +
                        pageIndex,
                      "Loading .....",
                      true
                    );
                  }, 100);
                }

                if (widgetDetail.isInitialCallHappened == false) {
                  $scope.changeImageWidget(widgetData);
                  widgetDetail.isInitialCallHappened = true;
                  $timeout(function () {
                    widgetDetail.pageCheck = true;
                  }, 3000);
                  $scope.manageImagewidgetInterval(widgetDetail);
                }
              }
            });
          },
          function (res) {
            console.log("error", res);
          }
        );
      } catch (e) {
        console.log("no image found!" + e);
      }
    };

    $scope.loadGooglePhotos = function (widgetData) {
    	var googleSharedAlbumUrl =
        widgetData.data.imageWidgetSetting.googleSharedAlbumUrl;
    	var imgData = $scope.getGoogleImageUrlFromLS(googleSharedAlbumUrl);
    	if (imgData != null) {
        var totalFound = imgData.data.length;
        var result = [];
        if (totalFound > 0) {
          for (var i = 0; i < totalFound; i++) {
            var customizeImageUrl = imgData.data[i];
            customizeImageUrl = customizeImageUrl + "=w" + $scope.bodyWidth + "-h" + $scope.bodyHeight;
            if(widgetData.data.imageWidgetSetting.isCropToFill){
            	customizeImageUrl = customizeImageUrl+"-c";
            }
            result.push(customizeImageUrl);
          }
        }
        angular.forEach($scope.imageWidgetList, function (widgetDetail) {
          if (widgetDetail.widgetId == widgetData.widgetSettingId) {
            for (
              var index = 0;
              index < widgetDetail.pagenumber.length;
              index++
            ) {
              let pageIndex = widgetDetail.pagenumber[index];
              $timeout(function () {
                $scope.showLoadingMessage(
                  "img_loading_" + widgetData.widgetSettingId + "_" + pageIndex,
                  "Loading .....",
                  true
                );
              }, 100);
            }

            widgetDetail.images.push(...$scope.randomizeImage(result));
            if (widgetDetail.isInitialCallHappened == false) {
              $scope.changeImageWidget(widgetData);
              widgetDetail.isInitialCallHappened = true;
              $timeout(function () {
                widgetDetail.pageCheck = true;
              }, 3000);
              $scope.manageImagewidgetInterval(widgetDetail);
            }
          }
        });
      }

      $timeout.cancel(imgTimeout);
      if (imgData == null || imgData.status != "loaded") {
        var imgTimeout = $timeout(function () {
          $scope.loadGooglePhotos(widgetData);
        }, 300);
      }
    };

    $scope.loadSinglePageUrl = function (widgetData) {
      try {
        var result = [];
        result.push(widgetData.data.imageUrlLink);
        angular.forEach($scope.imageWidgetList, function (widgetDetail) {
          if (widgetDetail.widgetId == widgetData.widgetSettingId) {
            widgetDetail.images.push(...result);

            for (
              var index = 0;
              index < widgetDetail.pagenumber.length;
              index++
            ) {
              let pageIndex = widgetDetail.pagenumber[index];
              $timeout(function () {
                $scope.showLoadingMessage(
                  "img_loading_" + widgetData.widgetSettingId + "_" + pageIndex,
                  "Loading .....",
                  true
                );
              }, 100);
            }

            if (widgetDetail.isInitialCallHappened == false) {
              $timeout(function () {
                $scope.changeImageWidget(widgetData);
              }, 200);
              widgetDetail.isInitialCallHappened = true;
              $timeout(function () {
                widgetDetail.pageCheck = true;
              }, 3000);
              $scope.manageImagewidgetInterval(widgetDetail);
            }
          }
        });
      } catch (e) {
        console.log("no image found!" + e);
      }
    };

    $scope.loadS3Url = function (widgetData) {
      try {
        var result = [];
        var contentType = "";
        if (widgetData.contentType == "pdf") {
          result.push(...widgetData.data.pdfImages);
          contentType = widgetData.data.iframeDetail.isCropToFill
            ? "cover"
            : "contain";
        } else {
          result.push(...widgetData.data.s3Data);
          contentType = widgetData.data.imageWidgetSetting.isCropToFill
            ? "cover"
            : "contain";
        }

        angular.forEach($scope.imageWidgetList, function (widgetDetail) {
          if (widgetDetail.widgetId == widgetData.widgetSettingId) {
            for (var i = 0; i < result.length; i++) {
              var key = result[i].replace(
                "https://myfiles.mangodisplay.com/",
                ""
              );
              key = key.replace(
                "https://user-drive-bucket.s3.amazonaws.com/",
                ""
              );
              var url = $scope.buildUrl(
                key,
                widgetData.height,
                widgetData.width,
                contentType
              );
              result[i] = url;
            }
            widgetDetail.images.push(...result);

            for (
              var index = 0;
              index < widgetDetail.pagenumber.length;
              index++
            ) {
              let pageIndex = widgetDetail.pagenumber[index];
              $timeout(function () {
                $scope.showLoadingMessage(
                  "img_loading_" + widgetData.widgetSettingId + "_" + pageIndex,
                  "Loading .....",
                  true
                );
              }, 100);
            }

            if (widgetDetail.isInitialCallHappened == false) {
              $timeout(function () {
                $scope.changeImageWidget(widgetData);
              }, 200);
              widgetDetail.isInitialCallHappened = true;
              $timeout(function () {
                widgetDetail.pageCheck = true;
              }, 3000);
              $scope.manageImagewidgetInterval(widgetDetail);
            }
          }
        });
      } catch (e) {
        console.log("no image found!" + e);
      }
    };

    $scope.loadApplePhotos = function (widgetData) {
      var imgObj = widgetData.data.imageWidgetSetting;
      APIServices.getApplePhotoUrl(imgObj, "image")
        .success(function (data, status) {
          if (data.object.imagewidgetData != undefined) {
            widgetData.data.imageWidgetSetting.isAppleImage =
              data.object.imagewidgetData.isAppleImage;
            widgetData.data.imageWidgetSetting.appleAccessToken =
              data.object.imagewidgetData.appleAccessToken;
          } else {
            if (data.object.applePhotoUrlObject != undefined) {
              var applePhotoURL = data.object.applePhotoUrlObject;
              applePhotoURL =
                data.object.applePhotoUrlObject.highResolutionUrlList;

              if (applePhotoURL != null && applePhotoURL.length > 0) {
                var totalFound = applePhotoURL.length;
                var result = [];
                if (totalFound > 0) {
                  for (var i = 0; i < totalFound; i++) {
                    var regular =
                      MANGO_MIRROR_CONSTANT.APPLE_ICLOUD_CONTENT +
                      applePhotoURL[i];
                    result.push(regular);
                  }
                }

                angular.forEach(
                  $scope.imageWidgetList,
                  function (widgetDetail) {
                    if (widgetDetail.widgetId == widgetData.widgetSettingId) {
                      if (totalFound > 0) {
                        widgetDetail.appleImageLastAccessTime = moment();
                        widgetDetail.images.push(
                          ...$scope.randomizeImage(result)
                        );
                        /*widgetDetail.images.push(...result);
																		widgetDetail.images = $scope.randomizeImage(widgetDetail.images);*/
                        widgetDetail.appleImage.length = 0;
                        widgetDetail.appleImage.push(...result);
                      } else {
                        if (widgetDetail.appleImage.length > 0) {
                          widgetDetail.images.push(widgetDetail.appleImage);
                        }
                      }
                      for (
                        var index = 0;
                        index < widgetDetail.pagenumber.length;
                        index++
                      ) {
                        let pageIndex = widgetDetail.pagenumber[index];
                        $timeout(function () {
                          $scope.showLoadingMessage(
                            "img_loading_" +
                              widgetData.widgetSettingId +
                              "_" +
                              pageIndex,
                            "Loading .....",
                            true
                          );
                        }, 100);
                      }

                      if (widgetDetail.isInitialCallHappened == false) {
                        $scope.changeImageWidget(widgetData);
                        widgetDetail.isInitialCallHappened = true;
                        $timeout(function () {
                          widgetDetail.pageCheck = true;
                        }, 3000);
                        $scope.manageImagewidgetInterval(widgetDetail);
                      }
                    }
                  }
                );
              }
            }
          }
        })
        .error(function (data, status) {
          angular.forEach($scope.imageWidgetList, function (widgetDetail) {
            if (widgetDetail.widgetId == widgetData.widgetSettingId) {
              widgetDetail.isAppleAccessStillValid = false;
            }
          });
          console.log("There are some issues while fetching apple photo");
        });
    };

    $scope.loadUnsplashPhotos = function (widgetData) {
      try {
        var listCount = widgetData.data.unsplashCollectionKeyList.length;
        for (var i = 0; i < listCount; i++) {
          var url1 =
            MANGO_MIRROR_CONSTANT.UNSPLASH_IMAGES_URL +
            MANGO_MIRROR_CONSTANT.UNSPLASH_CLIENT_ID +
            "&page=1&query=" +
            widgetData.data.unsplashCollectionKeyList[i] +
            "&count=30";
          $http({
            method: "GET",
            header: {
              "Content-Type": "application/json",
            },
            url: url1,
          }).then(
            function (res) {
              var totalFound = res.data.length;
              var result = [];
              if (totalFound > 0) {
                for (var i = 0; i < totalFound; i++) {
                  var regular = res.data[i].urls.regular;
                  result.push(regular);
                }
              }

              angular.forEach($scope.imageWidgetList, function (widgetDetail) {
                if (widgetDetail.widgetId == widgetData.widgetSettingId) {
                  widgetDetail.images.push(...$scope.randomizeImage(result));
                  /*widgetDetail.images.push(...result);
											        		widgetDetail.images = $scope.randomizeImage(widgetDetail.images);*/

                  for (
                    var index = 0;
                    index < widgetDetail.pagenumber.length;
                    index++
                  ) {
                    let pageIndex = widgetDetail.pagenumber[index];
                    $timeout(function () {
                      $scope.showLoadingMessage(
                        "img_loading_" +
                          widgetData.widgetSettingId +
                          "_" +
                          pageIndex,
                        "Loading .....",
                        true
                      );
                    }, 100);
                  }
                  if (widgetDetail.isInitialCallHappened == false) {
                    $scope.changeImageWidget(widgetData);
                    widgetDetail.isInitialCallHappened = true;
                    $timeout(function () {
                      widgetDetail.true = false;
                    }, 3000);
                    $scope.manageImagewidgetInterval(widgetDetail);
                  }
                }
              });
            },
            function (res) {
              console.log("error while loading unsplash");
            }
          );
        }
      } catch (e) {
        console.log("no image found!" + e);
      }
    };

    $scope.manageImagewidgetInterval = function (imageWidget) {
      var imageDelayTime = 60;
      if (imageWidget.widgetSetting.contentType == "image") {
        imageDelayTime =
          imageWidget.widgetSetting.data.imageWidgetSetting.imageDelayTime;
      } else if (imageWidget.widgetSetting.contentType == "pdf") {
        var iframeData = imageWidget.widgetSetting.data.iframeDetail;
        imageDelayTime = iframeData.imageDelayTime;
      }

      if (imageDelayTime > 0) {
        if (imageWidget.intervalObject != null) {
          $interval.cancel(imageWidget.intervalObject);
        }

        var currentInterval = $interval(function () {
          $scope.changeImageWidget(imageWidget.widgetSetting);
        }, imageDelayTime * 1000);
        imageWidget.intervalObject = currentInterval;
      }
    };

    $scope.showCurrentPageImageWidget = function () {
      angular.forEach($scope.imageWidgetList, function (widgetDetail) {
        if (widgetDetail.pagenumber.includes($scope.quoteIndex)) {
          if (
            widgetDetail.isInitialCallHappened == true &&
            widgetDetail.pageCheck
          ) {
            $scope.changeImageWidget(widgetDetail.widgetSetting);
          }
        }
      });
    };

    $scope.changeImageWidget = function (widgetData) {
      try {
        var isImageEnabledOnCurrentPage = false;
        angular.forEach($scope.imageWidgetList, function (widgetDetail) {
          if (
            widgetDetail.widgetId == widgetData.widgetSettingId &&
            widgetDetail.pagenumber.includes($scope.quoteIndex)
          ) {
            isImageEnabledOnCurrentPage = true;
          }
        });

        if (isImageEnabledOnCurrentPage == false) {
          return;
        }

        angular.forEach($scope.imageWidgetList, function (widgetDetail) {
          if (widgetDetail.widgetId == widgetData.widgetSettingId) {
            var key = "";
            var widgetSetting = "";

            if (widgetDetail.widgetSetting.contentType == "pdf") {
              key = "iframily_";
              widgetSetting = widgetDetail.widgetdata.iframeDetail;
            } else {
              key = "img_";
              widgetSetting = widgetDetail.widgetdata.imageWidgetSetting;
            }

            var timer = 0;
            if (widgetDetail.images.length > 1) {
              timer = 1000;
            }

            var imageId1 = document.getElementById(
              key + widgetData.widgetSettingId + "_" + $scope.quoteIndex + "_1"
            );
            var imageId2 = document.getElementById(
              key + widgetData.widgetSettingId + "_" + $scope.quoteIndex + "_2"
            );

            if (widgetDetail.images.length > 1) {
              if (widgetDetail.pagenumber.includes($scope.quoteIndex)) {
                var timer = 3200;
                widgetDetail.lastRenderedImage = widgetDetail.images[0];
                if (widgetDetail.toggle == true) {
                  $scope.setBackgroundImage(
                    imageId2,
                    widgetDetail.images[0],
                    widgetSetting.isCropToFill ? "cover" : "contain",
                    widgetSetting.imageBrightness
                  );
                  $timeout(function () {
                    if (imageId1 != undefined) {
                      $scope.setBackgroundImage(
                        imageId1,
                        widgetDetail.images[0],
                        widgetSetting.isCropToFill ? "cover" : "contain",
                        widgetSetting.imageBrightness
                      );
                    }
                  }, timer);
                } else {
                  $scope.setBackgroundImage(
                    imageId1,
                    widgetDetail.images[0],
                    widgetSetting.isCropToFill ? "cover" : "contain",
                    widgetSetting.imageBrightness
                  );
                  $timeout(function () {
                    if (imageId2 != undefined) {
                      $scope.setBackgroundImage(
                        imageId2,
                        widgetDetail.images[0],
                        widgetSetting.isCropToFill ? "cover" : "contain",
                        widgetSetting.imageBrightness
                      );
                    }
                  }, timer);
                }

                if (widgetDetail.widgetBackground.corner == "rounded") {
                  if (imageId1 != undefined) {
                    imageId1.style.borderRadius =
                      widgetDetail.widgetBackground.corner === "rounded"
                        ? "15px"
                        : "0px";
                  }

                  if (imageId2 != undefined) {
                    imageId2.style.borderRadius =
                      widgetDetail.widgetBackground.corner === "rounded"
                        ? "15px"
                        : "0px";
                  }
                }
                widgetDetail.images.splice(0, 1);
                if (widgetDetail.toggle == true) {
                  $timeout(function () {
                    imageId1.classList.remove("image-loaded");
                    imageId2.classList.add("image-loaded");
                  });
                } else {
                  $timeout(function () {
                    imageId2.classList.remove("image-loaded");
                    imageId1.classList.add("image-loaded");
                  });
                }

                widgetDetail.toggle = !widgetDetail.toggle;
              }
            } else if (widgetDetail.images.length > 0) {
              if (widgetDetail.pagenumber.includes($scope.quoteIndex)) {
                widgetDetail.lastRenderedImage = widgetDetail.images[0];
                $scope.setBackgroundImage(
                  imageId1,
                  widgetDetail.images[0],
                  widgetSetting.isCropToFill ? "cover" : "contain",
                  widgetSetting.imageBrightness
                );
                if (widgetDetail.widgetBackground.corner == "rounded") {
                  imageId1.style.borderRadius =
                    widgetDetail.widgetBackground.corner === "rounded"
                      ? "15px"
                      : "0px";
                }
                widgetDetail.images.splice(0, 1);
                $timeout(function () {
                  imageId1.classList.add("image-loaded");
                });
              }
            } else {
              if (
                widgetDetail.widgetdata.imageWidgetSetting != undefined &&
                widgetDetail.widgetdata.imageWidgetSetting.isAppleImage ==
                  false &&
                widgetDetail.widgetdata.imageWidgetSetting.isGoogleImage ==
                  false &&
                widgetDetail.widgetdata.imageWidgetSetting.isImageUrlEnable ==
                  false &&
                widgetDetail.widgetdata.imageWidgetSetting.isS3Enabled ==
                  false &&
                widgetDetail.widgetdata.imageWidgetSetting.isUnsplashImage ==
                  false
              ) {
                imageId2.style.background = "";
                imageId1.style.background = "";
              }
            }

            // update images once all images iterated
            var minutesDifference = 0;
            if (
              widgetSetting.appleAccessToken != undefined &&
              widgetSetting.isAppleImage != undefined &&
              widgetSetting.isAppleImage
            ) {
              minutesDifference = moment().diff(
                moment(widgetDetail.appleImageLastAccessTime),
                "minutes"
              );
            }
            var isDataUpdateNeeded = false;
            if (widgetDetail.images.length == 0) {
              widgetDetail.images.length = 0;
              isDataUpdateNeeded = true;
            } else if (widgetDetail.images.length == 1) {
              if (
                (widgetSetting.isGoogleImage != undefined &&
                  widgetSetting.isGoogleImage) ||
                (widgetSetting.isAppleImage != undefined &&
                  widgetSetting.isAppleImage) ||
                (widgetSetting.isDefaultUnsplashImage != undefined &&
                  widgetSetting.isDefaultUnsplashImage) ||
                (widgetSetting.isUnsplashImage != undefined &&
                  widgetSetting.isUnsplashImage) ||
                (widgetSetting.isS3Enabled != undefined &&
                  widgetSetting.isS3Enabled &&
                  widgetSetting.s3Data != undefined &&
                  ((widgetDetail.widgetdata.pdfImages != undefined &&
                    widgetDetail.widgetdata.pdfImages.length > 1) ||
                    (widgetDetail.widgetdata.s3Data != undefined &&
                      widgetDetail.widgetdata.s3Data.length > 1)))
              ) {
                isDataUpdateNeeded = true;
              }
            }

            if (minutesDifference > 60) {
              widgetDetail.images.length = 0;
              isDataUpdateNeeded = true;
            }

            if (isDataUpdateNeeded == true) {
              if (widgetDetail.intervalObject != null) {
                $interval.cancel(widgetDetail.intervalObject);
              }
              widgetDetail.isInitialCallHappened = false;
              widgetDetail.pageCheck = false;
              widgetDetail.intervalObject = null;
              $timeout(function () {
                $scope.refreshImageWidgetDataInternally(widgetDetail);
              }, widgetSetting.imageDelayTime * 1000);
            }
          }
        });
      } catch (e) {
        console.log(e);
      }
    };

    $scope.refreshImageWidgetDataInternally = function (widgetDetail) {
      var widgetData = widgetDetail.widgetSetting;
      angular.forEach($scope.imageWidgetList, function (imageWidgetSetting) {
        if (widgetData.widgetSettingId == imageWidgetSetting.widgetId) {
          $scope.loadImagesFromSource(
            widgetData,
            imageWidgetSetting.isAppleAccessStillValid
          );
        }
      });
    };

    /** this function is use to load apple photo */
    $scope.appleImageUrl = function () {
      var apple = [];
      if ($scope.applePhotoURL != null) {
        apple = $scope.applePhotoURL;
        var totalCount = apple.length;
        if (totalCount > 0) {
          for (var i = 0; i < totalCount; i++) {
            $scope.allPhotos.push({
              regular: MANGO_MIRROR_CONSTANT.APPLE_ICLOUD_CONTENT + apple[i],
              status: false,
              name: null,
            });
          }
        }

        $timeout(function () {
          if (!$scope.watchImageCallStatus) {
            $scope.showBackgroundImages();
          }
        }, 300);
      }
    };

    /** This function load unsplash images */
    $scope.unsplashPhotos = function () {
      try {
        // if(!$scope.unsplashUnauthorizeStatus){
        var listCount = $scope.unsplashCollectionKeyList.length;
        for (var i = 0; i < listCount; i++) {
          var url1 =
            MANGO_MIRROR_CONSTANT.UNSPLASH_IMAGES_URL +
            MANGO_MIRROR_CONSTANT.UNSPLASH_CLIENT_ID +
            "&page=1&query=" +
            $scope.unsplashCollectionKeyList[i] +
            "&count=30";
          $http({
            method: "GET",
            header: {
              "Content-Type": "application/json",
            },
            url: url1,
          }).then(
            function (res) {
              var totalFound = res.data.length;
              if (totalFound > 0) {
                for (var i = 0; i < totalFound; i++) {
                  var regular = res.data[i].urls.regular;
                  $scope.allPhotos.push({
                    regular: regular,
                    status: true,
                    name: res.data[i].user.name,
                    userName: res.data[i].user.username,
                    downloadLocation: res.data[i].links.download_location,
                  });
                }
              }

              $timeout(function () {
                if (!$scope.watchImageCallStatus) {
                  $scope.showBackgroundImages();
                }
              }, 300);
            },
            function (res) {
              console.log("error while loading unsplash");
            }
          );
        }
      } catch (e) {
        console.log("no image found!" + e);
      }
    };

    $scope.getGoogleimageUrl = function (sharedAlbumUrl) {
      var payload = {
        isSocketCall: true,
        googleAlbumUrl: sharedAlbumUrl,
      };
      $http({
        method: "POST",
        url: MANGO_MIRROR_CONSTANT.GOOGLE_PHOTO_URL,
        headers: {
          "Content-Type": "application/json",
          authtoken: $rootScope.authToken,
          "accept-language": "en-US, en; q = 0.8",
          source: "webApp",
        },
        data: payload,
      }).then(
        function (res) {
          if (res.data.status == "SUCCESS") {
            var resultArray = res.data.object.googleImageUrl;
            if (resultArray != null) {
              $scope.updateImageToStorage(sharedAlbumUrl, resultArray);
            }
          } else {
            $scope.markGoogleAlbumLoaded(sharedAlbumUrl);
          }
        },
        function (res) {
          $scope.markGoogleAlbumLoaded(sharedAlbumUrl);
        }
      );
    };

    $scope.markGoogleAlbumLoaded = function (albumUrl) {
      var googleAlbumLocalStorage = $localStorage.googleAlbumDetails;
      if (
        googleAlbumLocalStorage != undefined &&
        googleAlbumLocalStorage.length > 0
      ) {
        for (i = 0; i < googleAlbumLocalStorage.length; i++) {
          var imageObject = googleAlbumLocalStorage[i];
          var currentDate = moment();
          if (
            imageObject.name == albumUrl &&
            imageObject.status == "inprogress"
          ) {
            imageObject.status = "loaded";
            imageObject.lastUpdated = currentDate;
            googleAlbumLocalStorage[i] = imageObject;
            $localStorage.googleAlbumDetails = googleAlbumLocalStorage;
          }
        }
      }
    };

    /**
     * this function is use to save updated google
     * access token in database
     */
    $scope.updateGoogleAccessToken = function () {
      $scope.bgImage.googleAccessToken =
        $scope.backgroundImageObj.googleAccessToken;
      $scope.bgImage.id = $scope.backgroundImageObj.id;
      if (null != $scope.bgImage) {
        APIServices.updateGoogleAccessToken($scope.bgImage)
          .success(function (data, status) {})
          .error(function (data, status) {
            console.log(
              "There are some issues while updating google access token"
            );
          });
      }
    };

    /** This function load Default unsplash images */
    $scope.defaultUnsplashPhotos = function () {
      try {
        if ($scope.bodyHeight > $scope.bodyWidth) {
          var url1 =
            MANGO_MIRROR_CONSTANT.UNSPLASH_IMAGE_BY_COLLECTION_URL +
            "2600706/photos?client_id=" +
            MANGO_MIRROR_CONSTANT.UNSPLASH_CLIENT_ID;
        } else {
          var url1 =
            MANGO_MIRROR_CONSTANT.UNSPLASH_IMAGE_BY_COLLECTION_URL +
            "2600701/photos?client_id=" +
            MANGO_MIRROR_CONSTANT.UNSPLASH_CLIENT_ID;
        }

        $http({
          method: "GET",
          header: {
            "Content-Type": "application/json",
          },
          url: url1,
        }).then(
          function (res) {
            var totalFound = res.data.length;
            if (totalFound > 0) {
              for (var i = 0; i < totalFound; i++) {
                var regular = res.data[i].urls.regular;
                $scope.allPhotos.push({
                  regular: regular,
                  status: true,
                  name: res.data[i].user.name,
                  userName: res.data[i].user.username,
                  downloadLocation: res.data[i].links.download_location,
                });
              }
            }

            $timeout(function () {
              if (!$scope.watchImageCallStatus) {
                $scope.showBackgroundImages();
              }
            }, 300);
          },
          function (res) {
            console.log("error", res);
          }
        );
      } catch (e) {
        console.log("no image found!" + e);
      }
    };

    $scope.loadImageUrlLink = function () {
      try {
        $scope.allPhotos.push({
          regular: $scope.backgroundImageObj.imageUrlLink,
          status: false,
          name: null,
        });

        $timeout(function () {
          if (!$scope.watchImageCallStatus) {
            $scope.showBackgroundImages();
          }
        }, 300);
      } catch (e) {
        console.log("no image found!" + e);
      }
    };

    $scope.checkGoogleImageWidgetCalled = function (albumUrl) {
      var googleAlbumLocalStorage = $localStorage.googleAlbumDetails;
      var maxInProgressMinutes = 2;
      if (googleAlbumLocalStorage == undefined) {
        $localStorage.googleAlbumDetails = [];
        return false;
      }
      if (googleAlbumLocalStorage.length == 0) {
        return false;
      } else {
        for (i = 0; i < googleAlbumLocalStorage.length; i++) {
          imageObject = googleAlbumLocalStorage[i];
          if (
            imageObject.name == albumUrl &&
            imageObject.status == "inprogress"
          ) {
            var inProgressMinutesDifference = moment().diff(
              moment(imageObject.lastUpdated),
              "minutes"
            );
            return inProgressMinutesDifference <= maxInProgressMinutes;
          } else if (
            imageObject.name == albumUrl &&
            imageObject.status == "loaded"
          ) {
            var minutesDifference = moment().diff(
              moment(imageObject.lastUpdated),
              "minutes"
            );
            if (minutesDifference > 30) {
              return false;
            } else {
              return true;
            }
          }
        }
      }
      return false;
    };

    $scope.getGoogleImageUrlFromLS = function (albumUrl) {
      var googleAlbumLocalStorage = $localStorage.googleAlbumDetails;
      if (googleAlbumLocalStorage.length > 0) {
        for (i = 0; i < googleAlbumLocalStorage.length; i++) {
          var imageObject = googleAlbumLocalStorage[i];
          if (imageObject.name == albumUrl && imageObject.status == "loaded") {
        	return imageObject;
          }
        }
      }
      return null;
    };

    $scope.updateGoogleAlbumStatus = function (albumUrl) {
      var existingDetails = $localStorage.googleAlbumDetails;
      var matchedIndex = -1;
      if (existingDetails == undefined || existingDetails.length == 0) {
        matchedIndex = -1;
      } else {
        var matchedIndex = -1;
        for (i = 0; i < existingDetails.length; i++) {
          var imageObject = existingDetails[i];
          if (imageObject.name == albumUrl) {
            matchedIndex = i;
            break;
          }
        }
      }

      if (matchedIndex > -1) {
        var imageObject = existingDetails[matchedIndex];
        imageObject.status = "inprogress";
        imageObject.lastUpdated = moment();
        existingDetails[i] = imageObject;
        $localStorage.googleAlbumDetails = existingDetails;
      } else {
        var imageObject = {
          name: albumUrl,
          status: "inprogress",
          lastUpdated: moment(),
          data: [],
        };
        if (existingDetails.length > 0) {
          existingDetails.push(imageObject);
          $localStorage.googleAlbumDetails = existingDetails;
        } else {
          $localStorage.googleAlbumDetails = [imageObject];
        }
      }
      $scope.getGoogleimageUrl(albumUrl);
    };

    $scope.updateImageToStorage = function (albumUrl, images) {
      var googleAlbumLocalStorage = $localStorage.googleAlbumDetails;
      if (googleAlbumLocalStorage.length > 0) {
        for (i = 0; i < googleAlbumLocalStorage.length; i++) {
          var imageObject = googleAlbumLocalStorage[i];
          var currentDate = moment();
          if (
            imageObject.name == albumUrl &&
            imageObject.status == "inprogress"
          ) {
            imageObject.data = images;
            imageObject.status = "loaded";
            imageObject.lastUpdated = currentDate;
            googleAlbumLocalStorage[i] = imageObject;
            $localStorage.googleAlbumDetails = googleAlbumLocalStorage;
          }
        }
      }
    };

    $scope.addGoogleBackgroundImages = function (albumUrl) {
      var imgData = $scope.getGoogleImageUrlFromLS(albumUrl);
      if (imgData != null) {
        var imgUrls = imgData.data;
        var totalCount = imgUrls.length;
        if (totalCount > 0) {
          for (var i = 0; i < totalCount; i++) {
            var customizeImageUrl = imgUrls[i];
            customizeImageUrl = customizeImageUrl + "=w" + $scope.bodyWidth + "-h" + $scope.bodyHeight;
            if($scope.backgroundImageObj.isCropToFill){
            	customizeImageUrl = customizeImageUrl+"-c";
            }
            $scope.allPhotos.push({
              regular:customizeImageUrl,
              status: false,
              name: null,
            });
          }
        }

        $timeout(function () {
          if (!$scope.watchImageCallStatus) {
            $scope.showBackgroundImages();
          }
        }, 100);
      }

      $timeout.cancel(googleTimeout);
      if (imgData == null || imgData.status != "loaded") {
        var googleTimeout = $timeout(function () {
          $scope.addGoogleBackgroundImages(albumUrl);
        }, 300);
      }
    };

    $scope.checkAndRemoveUnusedAlbum = function () {
      var currentNeededAlbum = [];
      if (
        $scope.backgroundImageObj != undefined &&
        $scope.backgroundImageObj.googleSharedAlbumUrl != undefined
      ) {
        currentNeededAlbum.push($scope.backgroundImageObj.googleSharedAlbumUrl);
      }
      for (var i = 0; i < $scope.imageWidgetList.length; i++) {
        var imageWidgetSetting;
        if ($scope.imageWidgetList[i].widgetSetting.contentType == "pdf") {
          imageWidgetSetting =
            $scope.imageWidgetList[i].widgetdata.iframeDetail;
        } else {
          imageWidgetSetting =
            $scope.imageWidgetList[i].widgetdata.imageWidgetSetting;
        }
        if (
          imageWidgetSetting.isGoogleImage &&
          imageWidgetSetting.googleSharedAlbumUrl != null
        ) {
          currentNeededAlbum.push(imageWidgetSetting.googleSharedAlbumUrl);
        }
      }

      var newAlbums = [];
      var googleAlbumLocalStorage = $localStorage.googleAlbumDetails;
      if (googleAlbumLocalStorage != undefined) {
        for (var i = 0; i < googleAlbumLocalStorage.length; i++) {
          if (currentNeededAlbum.includes(googleAlbumLocalStorage[i].name)) {
            newAlbums.push(googleAlbumLocalStorage[i]);
          }
        }
      }

      $localStorage.googleAlbumDetails = newAlbums;
    };

    $scope.initializeImageExpiryThread = function () {
      if ($scope.imageRefreshTimeout) {
        $timeout.cancel($scope.imageRefreshTimeout);
        $scope.checkAndRemoveUnusedAlbum();
      }

      $scope.imageRefreshTimeout = $timeout(function () {
        var googleAlbumLocalStorage = $localStorage.googleAlbumDetails;
        if (googleAlbumLocalStorage == undefined) {
          return;
        }
        if (googleAlbumLocalStorage.length == 0) {
          return;
        } else {
          for (i = 0; i < googleAlbumLocalStorage.length; i++) {
            imageObject = googleAlbumLocalStorage[i];
            var minDifference = moment().diff(
              moment(imageObject.lastUpdated),
              "minutes"
            );
            if (minDifference > 30) {
              if (
                $scope.backgroundImageObj != undefined ||
                $scope.backgroundImageObj != null
              ) {
                var name = $scope.backgroundImageObj.googleSharedAlbumUrl;
                if (name == imageObject.name) {
                  $scope.updateGoogleAlbumStatus(
                    $scope.backgroundImageObj.googleSharedAlbumUrl
                  );
                  $scope.addGoogleBackgroundImages(
                    $scope.backgroundImageObj.googleSharedAlbumUrl
                  );
                }
              }
              for (var i = 0; i < $scope.groups.length; i++) {
                for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
                  if ($scope.groups[i].widgets[j].contentType == "image") {
                    var imageData = $scope.groups[i].widgets[j].data;
                    if (
                      imageData != undefined &&
                      imageData.imageWidgetSetting.googleSharedAlbumUrl !=
                        undefined
                    ) {
                      name = imageData.imageWidgetSetting.googleSharedAlbumUrl;
                      if (name == imageObject.name) {
                        $scope.removedExistingImageSetting(
                          $scope.groups[i].widgets[j].widgetSettingId
                        );
                        $scope.initializeImageWidget(
                          $scope.groups[i].widgets[j],
                          i
                        );
                      }
                    }
                  }
                }
              }
            }
          }
        }
        $scope.initializeImageExpiryThread();
      }, 60000);
    };

    $scope.createBase64 = function (inputString) {
      try {
        var encodedString = btoa(unescape(inputString));
        return encodedString;
      } catch (e) {
        console.error("Encoding failed:", e);
        return null;
      }
    };

    $scope.buildUrl = function (key, height, width, fitoption) {
      try {
        var payload = {
          bucket: "user-drive-bucket",
          key: key,
          edits: {
            resize: {
              height: height,
              fit: fitoption,
            },
          },
        };

        if (fitoption == "cover") {
          payload.edits.resize.width = width;
        }
        return (
          "https://myimages.mangodisplay.com/" +
          $scope.createBase64(JSON.stringify(payload))
        );
      } catch (e) {
        console.error("Encoding failed:", e);
        return null;
      }
    };

    $scope.loadS3Image = function () {
      if (
        $scope.backgroundImageObj.isS3Enabled != null &&
        $scope.backgroundImageObj.isS3Enabled &&
        $scope.background_s3Data.length
      ) {
        for (var i = 0; i < $scope.background_s3Data.length; i++) {
          var key = $scope.background_s3Data[i].replace(
            "https://myfiles.mangodisplay.com/",
            ""
          );
          key = key.replace("https://user-drive-bucket.s3.amazonaws.com/", "");
          var url = $scope.buildUrl(
            key,
            $scope.bodyHeight,
            $scope.bodyWidth,
            $scope.backgroundImageObj.isCropToFill ? "cover" : "contain"
          );
          $scope.allPhotos.push({
            regular: url,
            status: false,
            name: null,
          });
        }
      }

      if ($scope.watchImageCallStatus == false) {
        $scope.showBackgroundImages();
      }
    };

    // load apple photo
    $scope.loadAllPhotos = function () {
      if (
        $scope.backgroundImageObj.isS3Enabled != null &&
        $scope.backgroundImageObj.isS3Enabled
      ) {
        $scope.loadS3Image();
      }

      if (
        $scope.backgroundImageObj.imageUrlLink != null &&
        $scope.backgroundImageObj.isImageUrlEnable
      ) {
        $scope.loadImageUrlLink();
      }

      if (
        $scope.backgroundImageObj.isUnsplashImage &&
        $scope.unsplashCollectionKeyList.length > 0
      ) {
        $scope.unsplashPhotos();
      }
      if (
        null != $scope.backgroundImageObj.googleSharedAlbumUrl &&
        $scope.backgroundImageObj.isGoogleImage
      ) {
        var isApiAlreadyCalled = $scope.checkGoogleImageWidgetCalled(
          $scope.backgroundImageObj.googleSharedAlbumUrl
        );
        if (isApiAlreadyCalled == false) {
          $scope.updateGoogleAlbumStatus(
            $scope.backgroundImageObj.googleSharedAlbumUrl
          );
        }
        $scope.addGoogleBackgroundImages(
          $scope.backgroundImageObj.googleSharedAlbumUrl
        );
      }
      if ($scope.backgroundImageObj.isDefaultUnsplashImage) {
        $scope.defaultUnsplashPhotos();
      }

      if (
        null != $scope.backgroundImageObj.appleAccessToken &&
        $scope.backgroundImageObj.isAppleImage &&
        $scope.bgImageAppleAccessValid == true
      ) {
        APIServices.getApplePhotoUrl($scope.backgroundImageObj, "background")
          .success(function (data, status) {
            $localStorage.appleAccessToken = moment();
            if (data.object.imagewidgetData != undefined) {
              $scope.backgroundImageObj.isAppleImage =
                data.object.imagewidgetData.isAppleImage;
              $scope.backgroundImageObj.appleAccessToken =
                data.object.imagewidgetData.appleAccessToken;
            } else {
              if (data.object.applePhotoUrlObject != undefined) {
                $scope.applePhotoURL = data.object.applePhotoUrlObject;
                $scope.applePhotoURL =
                  data.object.applePhotoUrlObject.highResolutionUrlList;
                $scope.appleImageUrl();
              }
            }
          })
          .error(function (data, status) {
            console.log("There are some issues while fetching apple photo");
            $scope.bgImageAppleAccessValid = false;
          });
      }
      $scope.isResponseStatus = false;
    };

    if (
      $location.url().includes("major") &&
      $location.url().includes("minor") &&
      $location.url().includes("macaddress")
    ) {
      if (
        $location.search().macaddress.trim() != "" &&
        $location.search().major.trim() != "" &&
        $location.search().minor.trim() != ""
      ) {
        $scope.init();
      } else {
        $scope.loading = false;
        $scope.launchChrome = false;
        $scope.error_message =
          "Unable to load display URL = '" +
          $location.url() +
          "' . it may be incomplete or missing some details. Please share the screenshot with support.";
      }
    } else if ($location.url().includes("preview")) {
      if (
        $location.search().token.trim() != "" &&
        $location.search().preview.trim() != ""
      ) {
        $scope.init();
      } else {
        $scope.loading = false;
        $scope.launchChrome = false;
        $scope.error_message =
          "Unable to load display URL = '" +
          $location.url() +
          "' . it may be incomplete or missing some details. Please share the screenshot with support.";
      }
    } else {
      $scope.loading = false;
      $scope.launchChrome = false;
      $scope.error_message =
        "Unable to load display URL = '" +
        $location.url() +
        "' . it may be incomplete or missing some details. Please share the screenshot with support.";
    }

    if ($scope.checkUrlValueFlag == true) {
      if ($scope.isPreviewModeEnabled == true) {
        var payload = {
          type: MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_GET_WIDGETSETTING,
          height: $scope.bodyHeight,
          width: $scope.bodyWidth,
          preview: true,
          userId: $scope.userId,
          major: $scope.major,
          minor: $scope.minor,
          deviceId: $scope.macaddress,
          token: $scope.previewToken,
        };
        APIServices.getPreviewWidgetSetting(payload)
          .success(function (data, status) {
            var message = JSON.parse(data.object.data);
            $scope.loadInitialWidgetSetting(message);
          })
          .error(function (data, status) {
            if (data.error.message == "MANGO_PREVIEW_TOKEN_EXPIRE") {
              $scope.loading = false;
              $scope.launchChrome = false;
              $scope.error_message =
                "Display URL is expired. Please generate a new one.";
            }else if (data.error.message == "MANGO_TOKEN_INVALID") {
                $scope.loading = false;
                $scope.launchChrome = false;
                $scope.error_message =
                  "Invalid Preview URL. Please generate a new one.";
            } else {
              $scope.loading = false;
              $scope.launchChrome = false;
              $scope.error_message = "Something went wrong, please contact with support team.";
            }
          });
      } else {
        taskSocket = new WebSocket(
          APIServices.getSocketConnection(
            $scope.major,
            $scope.minor,
            $scope.macaddress
          )
        );

        taskSocket.onopen = function (event) {
          $scope.deviceCodeInvalid == false;
        };

        taskSocket.onerror = function (event) {
          var message =
            MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_OPEN_SOCKETCONNECTION_ERROR +
            " macaddress = " +
            $scope.macaddress;
          var subject =
            MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_OPEN_SOCKETCONNECTION_SUBJECT;
        };

        taskSocket.onclose = function (event) {
          var reason;

          if (event.code === 1000) {
            reason = MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_CODE_1000;
          } else if (event.code === 1001) {
            reason = MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_CODE_1001;
          } else if (event.code === 1002) {
            reason = MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_CODE_1002;
          } else if (event.code === 1003) {
            reason = MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_CODE_1003;
          } else if (event.code === 1006) {
            reason = MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_CODE_1006;
          } else if (event.code === 1007) {
            reason = MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_CODE_1007;
          } else if (event.code === 1008) {
            reason = MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_CODE_1008;
          } else if (event.code === 1009) {
            reason = MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_CODE_1009;
          } else if (event.code === 1010) {
            reason = MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_CODE_1010;
          } else if (event.code === 1011) {
            reason = MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_CODE_1011;
          } else if (event.code === 1015) {
            reason = MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_CODE_1015;
          } else {
            reason = MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_CODE_DEFAULT;
          }
          $scope.toasterMessage(reason);

          if (
            $scope.deviceCodeInvalid == false &&
            $rootScope.isAppInBackground == false
          ) {
            $interval.cancel($scope.socketIntervalTimeout);
            $scope.toasterMessage("Socket reconnecting ...");
            $scope.socketIntervalTimeout = $interval(
              $scope.checkInternetConnectionAndReload,
              Math.floor(Math.random() * 180001) + 30000
            );
          }
        };
        
        var autoSelectTimer;
        
        const AUDIO_URL =
            "https://displaytemplates.s3.us-east-1.amazonaws.com/media/silkbrowser/echoshow_media.mp3";


        // ⭐ added here
        let hasUnlocked = false;

        function newUrl() {
            return AUDIO_URL + "?q=" + Date.now();
        }

        // Create audio element
        const audio = document.createElement("audio");
        audio.src = newUrl();
        audio.autoplay = false;
        audio.muted = true;
        audio.playsInline = true;
        audio.loop = false;

        audio.style.position = "fixed";
        audio.style.bottom = "20px";
        audio.style.right = "20px";
        audio.style.zIndex = "2147483646";

        document.body.appendChild(audio);

        function reloadAudio() {
            audio.src = newUrl();
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }

        audio.onended = reloadAudio;

        // ⭐ updated to support auto-disable
        function unlockAudio() {
            if (hasUnlocked) return; // already unlocked once
            hasUnlocked = true;

            audio.muted = false;
            audio.play().catch(() => {});
            reloadAudio();

          
            // disable further listening
            document.removeEventListener("keydown", onKeyDown);
            clearTimeout(autoSelectTimer);
        }

        // ⭐ changed to a named function
        function onKeyDown(e) {
            if (e.key === "Enter" || e.keyCode === 13) {
                unlockAudio();
            }
        }

        document.addEventListener("keydown", onKeyDown);

        // Auto SELECT simulator (unchanged except a tiny addition above)
        function simulateSelectPress() {
           
            const evt = new KeyboardEvent("keydown", {
                key: "Enter",
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });

            evt.syntheticSource = "autoSelect";

            document.dispatchEvent(evt);
        }
        
        $scope.noOfPages = "";
        var goalSuccessImage;
        var goalFailureImage;
        var mirrorBackgroundSettings;

        $scope.patchWidgetGeometry = function (geometryResponse) {
          if (
            geometryResponse == undefined ||
            geometryResponse.changedPages == undefined
          ) {
            return;
          }

          var geometryByWidgetId = {};
          angular.forEach(geometryResponse.changedPages, function (changedPage) {
            angular.forEach(changedPage.widgets, function (widgetGeometry) {
              geometryByWidgetId[widgetGeometry.widgetSettingId] = widgetGeometry;
            });
          });

          var patchCollection = function (pages) {
            angular.forEach(pages, function (page) {
              angular.forEach(page.widgets, function (widget) {
                var geometry = geometryByWidgetId[widget.widgetSettingId];
                if (geometry == undefined) {
                  return;
                }
                widget.xPos = geometry.xPos;
                widget.yPos = geometry.yPos;
                widget.width = geometry.width;
                widget.height = geometry.height;
              });
            });
          };

          patchCollection($scope.groups);
          patchCollection($scope.temppgroups);

          var targetPage = geometryResponse.targetPage;
          if (targetPage == undefined) {
            return;
          }

          var targetPageIndex = -1;
          angular.forEach($scope.groups, function (page, index) {
            if (targetPageIndex === -1 && page.pageId == targetPage.pageId) {
              targetPageIndex = index;
            }
          });

          if (targetPageIndex < 0) {
            return;
          }

          $scope.pageCounter = 0;
          $timeout(function () {
            if (targetPageIndex !== $scope.quoteIndex) {
              $scope.goToPage(targetPageIndex);
            } else {
              $scope.autoResizeByPageNumber($scope.quoteIndex);
            }
          }, 0);
        };

        $scope.refreshChangedWidgets = function (notificationData) {
          var changedWidgets = [];
          angular.forEach(notificationData.changedPages, function (changedPage) {
            angular.forEach(changedPage.widgetSettingIds, function (widgetSettingId) {
              changedWidgets.push({
                pageId: changedPage.pageId,
                widgetSettingId: widgetSettingId,
              });
            });
          });

          if (changedWidgets.length === 0) {
            return;
          }

          APIServices.getWidgetGeometryData({
            deviceWidth: Math.round(Number($scope.bodyWidth)),
            deviceHeight: Math.round(Number($scope.bodyHeight)),
            changedWidgets: changedWidgets,
          }).then(
            function (response) {
              var responseObject =
                response && response.data ? response.data.object : undefined;
              if (responseObject == undefined) {
                $scope.refreshWidget();
                /* painted mode: fell back to a full redraw - recapture all */
                if (window.mmPaintedNotify) window.mmPaintedNotify("layout", "structural");
                return;
              }
              $scope.patchWidgetGeometry(responseObject);
              /* painted mode: geometry applied - announce each changed
               * widget so the render service recaptures exactly the
               * pages they live on (widget MOVES arrive here) */
              if (window.mmPaintedNotify) {
                angular.forEach(changedWidgets, function (changedWidget) {
                  window.mmPaintedNotify("layout", "widget", changedWidget.widgetSettingId);
                });
              }
            },
            function () {
              // Preserve the reliable legacy behavior if the partial read fails.
              $scope.refreshWidget();
              /* painted mode: fell back to a full redraw - recapture all */
              if (window.mmPaintedNotify) window.mmPaintedNotify("layout", "structural");
            }
          );
        };

        $scope.refreshPageBackground = function (changedPages) {
          var targetPageIndex = -1;
          var lowestPageNumber = Number.MAX_VALUE;
          angular.forEach(changedPages, function (changedPage) {
            angular.forEach($scope.groups, function (page, index) {
              if (page.pageId == changedPage.pageId) {
                page.isBackgroundImage = changedPage.isBackgroundImage;
                if (Number(page.pageNumber) < lowestPageNumber) {
                  targetPageIndex = index;
                  lowestPageNumber = Number(page.pageNumber);
                }
              }
            });
          });

          if (targetPageIndex < 0) {
            return;
          }

          /* painted mode: background flags changed on specific pages */
          if (window.mmPaintedNotify) window.mmPaintedNotify("layout", "structural");

          $scope.pageCounter = 0;
          if (targetPageIndex === $scope.quoteIndex) {
            $scope.checkAndUpdatePageBg();
          } else {
            $scope.goToPage(targetPageIndex);
          }
        };

        $scope.goToWidgetPage = function (pageContext) {
          if (
            pageContext == undefined ||
            pageContext.pageId == undefined ||
            pageContext.pageNumber == undefined
          ) {
            return;
          }

          var targetPageIndex = -1;
          angular.forEach($scope.groups, function (page, pageIndex) {
            if (targetPageIndex < 0 && page.pageId == pageContext.pageId) {
              targetPageIndex = pageIndex;
            }
          });

          if (targetPageIndex < 0) {
            angular.forEach($scope.groups, function (page, pageIndex) {
              if (
                targetPageIndex < 0 &&
                page.pageNumber == pageContext.pageNumber
              ) {
                targetPageIndex = pageIndex;
              }
            });
          }

          if (targetPageIndex < 0) {
            return;
          }

          $scope.pageCounter = 0;
          $timeout(function () {
            if (targetPageIndex !== $scope.quoteIndex) {
              $scope.goToPage(targetPageIndex);
            }
            /* painted mode: the backend named the page this change
             * belongs to and we have navigated there - tell the render
             * service, so the TV mirrors the portal instead of sitting
             * on whatever page it happened to be showing */
            if (window.mmPaintedNotify) window.mmPaintedNotify("layout", "widget");
          }, 0);
        };

        $scope.clearTargetedWidgetRuntime = function (refreshedWidget) {
          var widgetSettingId = refreshedWidget.widgetSettingId;
          var existingWidget;

          angular.forEach($scope.groups, function (page) {
            angular.forEach(page.widgets || [], function (widget) {
              if (
                existingWidget == undefined &&
                widget.widgetSettingId == widgetSettingId
              ) {
                existingWidget = widget;
              }
            });
          });

          var widgetToClear = existingWidget || refreshedWidget;
          var contentType = widgetToClear.contentType;
          var widgetMasterCategory = widgetToClear.widgetMasterCategory;

          if (contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_IMAGE) {
            var refreshedImageData = angular.copy(refreshedWidget.data || {});
            refreshedImageData.widgetId = widgetSettingId;
            $scope.checkAndRemoveCurrentRendering(refreshedImageData);
            $scope.removedExistingImageSetting(widgetSettingId);
          } else if (contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_GIF) {
            $scope.removeExistingGifSetting(widgetSettingId);
          }

          if (
            widgetMasterCategory == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_IFRAMILY
          ) {
            if (existingWidget != undefined) {
              $scope.discardReplacedMediaUrl(
                existingWidget.data,
                refreshedWidget.data,
                "baseurl",
                "processedBaseurl",
                "trustedVideoUrl",
                widgetSettingId
              );
            }
            var refreshedIframeData = angular.copy(refreshedWidget.data || {});
            refreshedIframeData.widgetId = widgetSettingId;
            $scope.checkAndRemoveCurrentPdfImgRendering(refreshedIframeData);
            $scope.removeOldMappedIframeData(widgetSettingId);
            $scope.removedExistingImageSetting(widgetSettingId);
          }

          if (
            contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_BROWSER_SNAPSHOT
          ) {
            $scope.clearSnapshotExistObject(widgetSettingId);
          } else if (
            contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_POWER_BI
          ) {
            $scope.clearPowerBiExistObject(widgetSettingId);
          } else if (
            contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_TODO
          ) {
            $scope.clearTodoExistingObject(widgetSettingId);
          } else if (
            contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CHORES
          ) {
            $scope.clearChoresExistingObject(widgetSettingId);
            $scope.clearTodoExistingObject(widgetSettingId);
          } else if (
            contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CALENDAR ||
            contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_MEALPLAN
          ) {
            $scope.clearCalendarTimeout(widgetSettingId);
            $scope.clearCalendarNextRefreshTimeout(widgetSettingId);
          } else if (
            contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CLOCK
          ) {
            for (var i = $scope.clockWidgetList.length - 1; i >= 0; i--) {
              if ($scope.clockWidgetList[i].widgetId == widgetSettingId) {
                if ($scope.clockWidgetList[i].intervalObject != null) {
                  $interval.cancel($scope.clockWidgetList[i].intervalObject);
                }
                $scope.clockWidgetList.splice(i, 1);
              }
            }
          } else if (
            contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_COUNTDOWN
          ) {
            for (
              var countdownIndex =
                $scope.countdownWidgetInterval.length - 1;
              countdownIndex >= 0;
              countdownIndex--
            ) {
              if (
                $scope.countdownWidgetInterval[countdownIndex].widgetId ==
                widgetSettingId
              ) {
                $interval.cancel(
                  $scope.countdownWidgetInterval[countdownIndex].intervalObject
                );
                $scope.countdownWidgetInterval.splice(countdownIndex, 1);
              }
            }
          }
        };

        $scope.updateTargetedWidgetSharedRuntime = function (refreshedWidget) {
          var widgetSettingId = refreshedWidget.widgetSettingId;
          var widgetData = refreshedWidget.data || {};

          if (
            refreshedWidget.contentType ==
            MANGO_MIRROR_CONSTANT.WIDGET_TYPE_TODO
          ) {
            $scope.updateTodoDataInterval(false);
          } else if (
            refreshedWidget.contentType ==
            MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CHORES
          ) {
            $scope.updateChoresExistingWidgetList(
              widgetSettingId,
              widgetData.todos && Object.keys(widgetData.todos).length > 0
                ? "add"
                : "remove"
            );
          } else if (
            refreshedWidget.contentType ==
            MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CALENDAR
          ) {
            $scope.UpdateIcalId(widgetSettingId, widgetData.iCal);
            if (widgetData.isIcalUpdate == true) {
              $scope.updateIcalAccountAndCalendar(widgetData);
            } else {
              $scope.updateIcalEtag(widgetData.icalCalendar);
            }
          }
        };

        $scope.initializeTargetedWidgetRuntime = function (
          widget,
          pageIndex,
          widgetIndex
        ) {
          if (widget.status != "on") {
            return;
          }

          // These widgets are not initialized by autoResizeByPageNumber.
          // Todo, Chores, Calendar, Meal Plan, Countdown, and Browser Snapshot
          // are restarted by that existing page-render pass after navigation.
          if (widget.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_IMAGE) {
            $scope.initializeImageWidget(widget, pageIndex);
          } else if (
            widget.widgetMasterCategory ==
            MANGO_MIRROR_CONSTANT.WIDGET_TYPE_IFRAMILY
          ) {
            $scope.initializeIframilyWidget(widget, pageIndex);
          } else if (
            widget.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_POWER_BI
          ) {
            $scope.initializePowerBiWidget(widget, pageIndex, widgetIndex);
          } else if (
            widget.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CLOCK
          ) {
            $scope.initClock(widget, pageIndex, widgetIndex);
          }
        };

        $scope.refreshPageWidgets = function (notificationData) {
          if (
            notificationData == undefined ||
            notificationData.operation == undefined
          ) {
            return;
          }

          var operation = notificationData.operation.toUpperCase();
          var widgetSettingIds = notificationData.widgetSettingIds || [];
          var targetPageIndex = -1;

          if (operation === "INDEX") {
            var widgetIndexes = notificationData.widgetIndexes || [];
            var widgetIndexById = {};
            angular.forEach(widgetIndexes, function (widgetIndex) {
              widgetIndexById[widgetIndex.widgetSettingId] = widgetIndex.zindex;
            });

            angular.forEach($scope.groups, function (page, pageIndex) {
              angular.forEach(page.widgets || [], function (widget) {
                var updatedIndex = widgetIndexById[widget.widgetSettingId];
                if (updatedIndex != undefined) {
                  widget.zindex = updatedIndex;
                }
              });

              if (page.pageId == notificationData.pageId) {
                targetPageIndex = pageIndex;
              }
            });

            if (targetPageIndex < 0) {
              angular.forEach($scope.groups, function (page, pageIndex) {
                if (
                  targetPageIndex < 0 &&
                  page.pageNumber == notificationData.pageNumber
                ) {
                  targetPageIndex = pageIndex;
                }
              });
            }

            if (targetPageIndex < 0) {
              return;
            }

            /* painted mode: the z-order change is applied - announce the
             * touched widgets so the render service recaptures exactly
             * the pages they live on */
            if (window.mmPaintedNotify) {
              angular.forEach(widgetIndexes, function (widgetIndex) {
                window.mmPaintedNotify("layout", "index", widgetIndex.widgetSettingId);
              });
            }

            $scope.pageCounter = 0;
            $timeout(function () {
              if (targetPageIndex !== $scope.quoteIndex) {
                $scope.goToPage(targetPageIndex);
              }
            }, 0);
            return;
          }

          if (operation === "UPDATE") {
            if (widgetSettingIds.length === 0) {
              return;
            }

            $timeout(function () {
              var widgetRefreshRequests = [];
              angular.forEach(widgetSettingIds, function (widgetSettingId) {
                widgetRefreshRequests.push(
                  APIServices.getWidgetRefreshData({
                    pageId: notificationData.pageId,
                    widgetSettingId: widgetSettingId,
                    deviceWidth: Math.round(Number($scope.bodyWidth)),
                    deviceHeight: Math.round(Number($scope.bodyHeight)),
                  })
                );
              });

              $q.all(widgetRefreshRequests).then(
              function (responses) {
                var refreshedWidgetCount = 0;
                angular.forEach(responses, function (response) {
                  var responseObject =
                    response && response.data
                      ? response.data.object
                      : undefined;
                  if (
                    responseObject == undefined ||
                    responseObject.widget == undefined
                  ) {
                    return;
                  }

                  var refreshedWidget = responseObject.widget;
                  $scope.clearTargetedWidgetRuntime(refreshedWidget);
                  $scope.updateTargetedWidgetSharedRuntime(refreshedWidget);
                  angular.forEach($scope.groups, function (page, pageIndex) {
                    angular.forEach(
                      page.widgets || [],
                      function (widget, widgetIndex) {
                        if (
                          widget.widgetSettingId ==
                          refreshedWidget.widgetSettingId
                        ) {
                          angular.extend(widget, angular.copy(refreshedWidget));
                          $scope.loadPageData(widget, pageIndex);
                          $scope.initializeTargetedWidgetRuntime(
                            widget,
                            pageIndex,
                            widgetIndex
                          );
                          refreshedWidgetCount++;
                        }
                      }
                    );

                    if (page.pageId == notificationData.pageId) {
                      targetPageIndex = pageIndex;
                    }
                  });
                });

                if (refreshedWidgetCount === 0) {
                  return;
                }

                if (targetPageIndex < 0) {
                  angular.forEach($scope.groups, function (page, pageIndex) {
                    if (
                      targetPageIndex < 0 &&
                      page.pageNumber == notificationData.pageNumber
                    ) {
                      targetPageIndex = pageIndex;
                    }
                  });
                }

                if (targetPageIndex < 0) {
                  return;
                }

                $scope.pageCounter = 0;
                $timeout(function () {
                  if (targetPageIndex !== $scope.quoteIndex) {
                    $scope.goToPage(targetPageIndex);
                  } else {
                    $scope.autoResizeByPageNumber($scope.quoteIndex);
                  }
                  /* painted mode: settings edits reach us here now that
                   * the backend sends them targeted rather than as a
                   * restart-display. The ids let the service resolve
                   * which page changed. */
                  if (window.mmPaintedNotify) {
                    window.mmPaintedNotify("layout", "widget", widgetSettingIds);
                  }
                }, 0);
              },
              function (error) {
                console.log("Unable to refresh updated widget", error);
              }
              );
            }, 300);
            return;
          }

          if (operation === "DELETE") {
            var currentPage = $scope.groups[$scope.quoteIndex];
            var currentPageId = currentPage ? currentPage.pageId : undefined;
            angular.forEach(widgetSettingIds, function (widgetSettingId) {
              $scope.clearTargetedWidgetRuntime({
                widgetSettingId: widgetSettingId,
              });

              angular.forEach($scope.groups, function (page, pageIndex) {
                var widgets = page.widgets || [];
                for (
                  var widgetIndex = widgets.length - 1;
                  widgetIndex >= 0;
                  widgetIndex--
                ) {
                  if (widgets[widgetIndex].widgetSettingId == widgetSettingId) {
                    widgets.splice(widgetIndex, 1);
                  }
                }
                page.isPageBlank =
                  widgets.length === 0 &&
                  page.isBackgroundImage !== true &&
                  page.isBackgroundImage !== "true";
              });
            });

            for (
              var pageIndex = $scope.groups.length - 1;
              pageIndex >= 0;
              pageIndex--
            ) {
              if ($scope.groups[pageIndex].isPageBlank === true) {
                $scope.groups.splice(pageIndex, 1);
              }
            }

            $scope.noOfPages = $scope.groups.length;
            $localStorage.totalPage = $scope.noOfPages;
            $scope.pruneOrphanedMediaCache();

            if ($scope.groups.length === 0) {
              $scope.quoteIndex = 0;
              $scope.pageCounter = 0;
              $scope.transitionPage = [];
              $scope.clearBackgroundImageLayers();
              return;
            }

            angular.forEach($scope.groups, function (page, pageIndex) {
              if (page.pageId == notificationData.pageId) {
                targetPageIndex = pageIndex;
              }
            });

            if (targetPageIndex < 0) {
              var deletedPageNumber = Number(notificationData.pageNumber);
              angular.forEach($scope.groups, function (page, pageIndex) {
                if (
                  targetPageIndex < 0 &&
                  Number(page.pageNumber) > deletedPageNumber
                ) {
                  targetPageIndex = pageIndex;
                }
              });
            }

            if (targetPageIndex < 0) {
              targetPageIndex = $scope.groups.length - 1;
            }

            /* painted mode: widgets left the DOM and blank pages may have
             * been pruned, so page indexes shifted - a structural change
             * recaptures every page */
            if (window.mmPaintedNotify) window.mmPaintedNotify("layout", "structural");

            var targetPageId = $scope.groups[targetPageIndex].pageId;
            $scope.pageCounter = 0;
            $timeout(function () {
              if (currentPageId != targetPageId) {
                if (targetPageIndex === $scope.quoteIndex) {
                  $scope.quoteIndex = -1;
                }
                $scope.goToPage(targetPageIndex);
              } else {
                $scope.quoteIndex = targetPageIndex;
                $scope.autoResizeByPageNumber($scope.quoteIndex);
              }
            }, 0);
            return;
          }

          if (operation !== "ADD" || widgetSettingIds.length === 0) {
            return;
          }

          APIServices.getWidgetRefreshData({
            pageId: notificationData.pageId,
            widgetSettingId: widgetSettingIds[0],
            deviceWidth: Math.round(Number($scope.bodyWidth)),
            deviceHeight: Math.round(Number($scope.bodyHeight)),
          }).then(
            function (response) {
              var responseObject =
                response && response.data ? response.data.object : undefined;
              if (
                responseObject == undefined ||
                responseObject.page == undefined ||
                responseObject.widget == undefined
              ) {
                return;
              }

              var refreshedPage = responseObject.page;
              var refreshedWidget = responseObject.widget;
              var previousPageCount = $scope.groups.length;
              angular.forEach($scope.groups, function (page, pageIndex) {
                if (page.pageId == refreshedPage.pageId) {
                  targetPageIndex = pageIndex;
                }
              });

              if (targetPageIndex < 0) {
                var newPage = angular.copy(refreshedPage);
                newPage.widgets = [];
                $scope.groups.push(newPage);
                $scope.groups.sort(function (firstPage, secondPage) {
                  return (
                    Number(firstPage.pageNumber) - Number(secondPage.pageNumber)
                  );
                });
              }

              var isPinned =
                refreshedWidget.pinned === true ||
                refreshedWidget.pinned === "true";
              angular.forEach($scope.groups, function (page, pageIndex) {
                if (!isPinned && page.pageId != refreshedPage.pageId) {
                  return;
                }

                page.widgets = page.widgets || [];
                var widgetExists = false;
                angular.forEach(page.widgets, function (widget) {
                  if (
                    widget.widgetSettingId == refreshedWidget.widgetSettingId
                  ) {
                    widgetExists = true;
                  }
                });
                if (!widgetExists) {
                  page.widgets.push(angular.copy(refreshedWidget));
                }
                page.isPageBlank = false;
                if (page.pageId == refreshedPage.pageId) {
                  targetPageIndex = pageIndex;
                }
              });

              $scope.noOfPages = $scope.groups.length;
              $localStorage.totalPage = $scope.noOfPages;

              /* painted mode: widget applied (page count may have grown -
               * that case is structural) */
              if (window.mmPaintedNotify) {
                if ($scope.groups.length !== previousPageCount) {
                  window.mmPaintedNotify("layout", "structural");
                } else {
                  window.mmPaintedNotify("layout", "widget", refreshedWidget.widgetSettingId);
                }
              }

              $scope.pageCounter = 0;
              $timeout(function () {
                if (targetPageIndex !== $scope.quoteIndex) {
                  $scope.goToPage(targetPageIndex);
                } else {
                  $scope.autoResizeByPageNumber($scope.quoteIndex);
                }
              }, 0);
            },
            function (error) {
              console.log("Unable to refresh added widget", error);
            }
          );
        };

        taskSocket.onmessage = function (message) {
          if (userAgent.indexOf("aftt") !== -1) {
            $scope.isFireTvApp = true;
          }
          var message = JSON.parse(message.data);
          if (message.refreshTime != undefined) {
            $scope.displayDataRefreshTimeOutInterval =
              message.refreshTime +
              Math.floor(Math.random() * (120000 - 1000 + 1)) +
              1000;
            if (
              $scope.displayDataRefreshTimeOut != undefined ||
              $scope.displayDataRefreshTimeOut != null
            ) {
              $timeout.cancel($scope.displayDataRefreshTimeOut);
              $scope.displayDataRefreshTimeOut = null;
            }
            $scope.displayDataRefreshTimeOut = $timeout(function () {
              $scope.refreshdataOnNextday();
            }, $scope.displayDataRefreshTimeOutInterval);
          }
          if (message.type === "socket_connection_success") {
            $scope.isDataLoadedThroughSocket = false;
            var existingDetails = $localStorage.googleAlbumDetails;
            if (existingDetails == undefined || existingDetails == null) {
              $localStorage.googleAlbumDetails = [];
            }

            var mirroDetail = JSON.parse(message.data);
            $scope.currentOrientation = mirroDetail.orientation;
            $scope.isChildDisplay = mirroDetail.isChildDisplay;

            if ($scope.macaddress.startsWith("LG")) {
              $scope.defaultVideoSrc = $sce.trustAsResourceUrl(
                "https://displaytemplates.s3.us-east-1.amazonaws.com/media/silkbrowser/lg_tv_silent_loop.mp4"
              );
              $scope.isDefaultVideo = true;
            }else if (
              $scope.macaddress.startsWith("FV") ||
              $scope.macaddress == "AN343478298" ||
              $scope.macaddress == "AN664118436"
            ) {
        	   autoSelectTimer = setTimeout(() => {
                   simulateSelectPress();
               }, 5000);
            }else {
              $scope.isDefaultVideo = false;
            }
            $scope.refreshWidget();
            $scope.socketStatus = true;
            $scope.socketCheckInitialization();
            $scope.socketDataLoadCheckInitialization();
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_WIDGET_LIST
          ) {
            $scope.isDataLoadedThroughSocket = true;
            $scope.bgImageAppleAccessValid = true;            
            $scope.loadInitialWidgetSetting(message);
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_RESTART_DISPLAY
          ) {
             window.location.reload();
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_UPDATE_GESTURE
          ) {
            $scope.updateGesture(message.data);
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_UPDATE_OVERLAY
          ) {
            $scope.updateOverlayData(message.data);
          } else if (
            message.type ===
            MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESH_IMAGE_SETTING
          ) {
            var parsedData = message.data;
            var updatedImageWidgetData = JSON.parse(parsedData);
            $scope.updateImageWidgetData(updatedImageWidgetData);
          } else if (
            message.type ===
            MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESH_ORIENTATION
          ) {
            var obj = JSON.parse(message.data);
            if ($scope.currentOrientation == 0) {
              window.location.reload();
            } else {
              if (window.mmPaintedNotify) window.mmPaintedNotify("socket", "orientation", null);
              var payload = {
                type: MANGO_MIRROR_CONSTANT.DISPLAY_ORIENTATION_UPDATE,
                data: { orientation: obj.orientation },
              };
              $scope.sendToParent(payload);
            }
          }else if (message.type ===
                  MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESH_ORIENTATION
                ) {
                  var obj = JSON.parse(message.data);
                  if ($scope.currentOrientation == 0) {
                    window.location.reload();
                  } else {
                    var payload = {
                      type: MANGO_MIRROR_CONSTANT.DISPLAY_ORIENTATION_UPDATE,
                      data: { orientation: obj.orientation },
                    };
                    $scope.sendToParent(payload);
                  }
          }else if (
            message.type ===
            MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESH_MIRROR_BACKGROUND
          ) {
            var obj = JSON.parse(message.data);
            $scope.userId = obj.userId;
            if ($scope.userId != undefined) {
              $localStorage.userId = $scope.userId;
              $scope.refreshWidget();
            }
          } else if (
            message.type ===
            MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_LOAD_GENERALSETTING
          ) {
            var obj = JSON.parse(message.data);
            if (obj.motionType === "START") {
              if (message.loadSetting) {
                $scope.deviceMotionStart();
                $scope.userId = "";
                $localStorage.userId = $scope.userId;
                $scope.refreshWidget();
              } else {
                if (obj.refreshWeather != undefined) {
                  $scope.updateWeatherData(obj.refreshWeather);
                }
                $scope.deviceMotionStart();
              }
            }
            if (obj.motionType === "STOP") {
              $scope.deviceMotionStop();
            }
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_REFRESH_WIDGETS
          ) {
            var obj = JSON.parse(message.data);
            $scope.refreshChangedWidgets(obj);
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_REFRESH_LAYOUT
          ) {
            var obj = JSON.parse(message.data);
            if (obj.refreshPageBackground != undefined) {
              $scope.refreshPageBackground(obj.refreshPageBackground);
            } else if (obj.refreshPageWidgets != undefined) {
              $scope.refreshPageWidgets(obj.refreshPageWidgets);
            } else if (obj.refreshWidget != undefined) {
              var obj = obj.refreshWidget;
              $scope.userId = obj.userId;
              if ($scope.userId != undefined) {
                $localStorage.userId = $scope.userId;
                $scope.fullpageLoaded = false;
                $scope.refreshWidget();
              }
            } else {
              if (obj.refreshImageWidgetData != undefined) {
                var updatedImageWidgetData = obj.refreshImageWidgetData;
                $scope.updateImageWidgetData(updatedImageWidgetData);
              }
              if (obj.backgroundImageDetailsUpdated != undefined) {
                  $scope.refreshWidget();
                }
              if (obj.refreshGifWidgetData != undefined) {
                var updatedGifWidgetData = obj.refreshGifWidgetData;
                $scope.updateGifWidgetData(updatedGifWidgetData);
              }
              if (obj.refreshClock != undefined) {
                $scope.updateClock(obj.refreshClock);
              }

              if (obj.refreshQuotes != undefined) {
                $scope.updateQuotes(obj.refreshQuotes);
              }
              if (obj.refreshNotes != undefined) {
                $scope.updateNotes(obj.refreshNotes);
              }
              if (obj.refreshMarketWatchData != undefined) {
                $scope.updateMarketWatch(obj.refreshMarketWatchData);
              }
              if (obj.refreshCalenderData != undefined) {
                $scope.updateCalendarData(obj.refreshCalenderData);
              }
              if (obj.refreshMealPlan != undefined) {
                $scope.updateCalendarData(obj.refreshMealPlan);
              }
              if (obj.refreshHealthKitData != undefined) {
                $scope.updateStepsData(obj.refreshHealthKitData);
              }
              if (obj.refreshNews != undefined) {
                if (obj.refreshNews != undefined) {
                  $scope.updateNewsData(obj.refreshNews);
                }
              }
              if (obj.refreshIframilyData != undefined) {
                var parsedData = message.data;
                var updatedIframilyData = JSON.parse(parsedData);
                $scope.updateIframilyData(updatedIframilyData);
              }
              if (obj.refreshTodo != undefined) {
                $scope.updateTodoData(obj.refreshTodo);
              }
              if (obj.refreshCountDown != undefined) {
                $scope.updateCountDownData(obj.refreshCountDown);
              }
              if (obj.refreshChores != undefined) {
                $scope.updateChoresData(obj.refreshChores);
              }
              if (obj.refreshWeather != undefined) {
                $scope.updateWeatherData(obj.refreshWeather);
              }              
              if (obj.refreshBrowserSnapshotData != undefined) {
                $scope.updateBrowserSnapshotData(obj.refreshBrowserSnapshotData);
              } 
              if(obj.refreshPowerBI != undefined){
                  $scope.updatePowerBiData(obj.refreshPowerBI);            	  
              }
              if (obj.pageContext != undefined) {
                $scope.goToWidgetPage(obj.pageContext);
              }
            }
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_REFRESH_POWERBI
          ) {
            var obj = JSON.parse(message.data);
            $scope.updatePowerBiData(obj);
          }else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_REFRESH_BLEDATA
          ) {
            var obj = JSON.parse(message.data);
            if (obj.refreshCalenderData != undefined) {
              $scope.updateCalendarData(obj.refreshCalenderData);
            }
            if (obj.refreshHealthKitData != undefined) {
              $scope.updateStepsData(obj.refreshHealthKitData);
            }
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_RESET_DEVICE
          ) {
            if (
              message.data === MANGO_MIRROR_CONSTANT.DEVICE_TYPE_LINKEDBROWSER
            ) {
              //may be need to update rotation
              alert("This display has been reset!");
            } else {
              $scope.toasterMessage(
                "This display has been reset! Please relaunch your Mango Display App to set it up again."
              );
            }
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESH_NEWS
          ) {
            var obj = JSON.parse(message.data);
            if (obj != undefined) {
              $scope.updateNewsData(obj);
            }
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESH_WIDGET
          ) {
            var obj = JSON.parse(message.data);
            if (obj != null) {
              $scope.userId = obj.userId;
              if ($scope.userId != undefined) {
                $localStorage.userId = $scope.userId;
                $scope.refreshWidget();
              }
            } else {
              $scope.refreshWidget();
            }
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESH_QUOTES
          ) {
            var parsedData = message.data;
            $scope.updatedQuotesData = JSON.parse(parsedData);
            $scope.updateQuotes($scope.updatedQuotesData);
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESH_NOTES
          ) {
            var parsedData = message.data;
            $scope.updatedNotessData = JSON.parse(parsedData);
            $scope.updateNotes($scope.updatedNotessData);
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESHCALENDAR
          ) {
            var parsedData = message.data;
            $scope.updatedCalendarData = JSON.parse(parsedData);
            $scope.updateCalendarData($scope.updatedCalendarData);
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESH_CLOCK
          ) {
            var parsedData = message.data;
            $scope.updatedClockData = JSON.parse(parsedData);
            $scope.updateClock($scope.updatedClockData);
          } else if (
            message.type ===
            MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESH_HEALTHDATA
          ) {
            $scope.updateStepsData(JSON.parse(message.data));
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESH_WEATHER
          ) {
            $scope.updateWeatherData(JSON.parse(message.data));
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_EXCEPTION
          ) {
            $scope.loading = false;
            $scope.toasterMessage(message.message);
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_ERROR
          ) {
            $scope.loading = false;
            message.message = message.message.replace("mirror", "Display");
            $scope.toasterMessage(message.message);
            $scope.deviceCodeInvalid = true;
            var message =
              MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_WRONG_MAJOR_MINOR_MESSAGE +
              " major = " +
              $scope.major +
              ",minor = " +
              $scope.minor;
            var subject =
              MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_WRONG_MAJOR_MINOR_SUBJECT;
            //													$scope.sendAutoLog(subject,message);
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.CHECK_SOCKET_STATUS
          ) {
            $scope.socketStatus = true;
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_REFRESH_PORTAL
          ) {
            $scope.refreshWidget();
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESHIFRAMELY
          ) {
            var parsedData = message.data;
            var updatedIframilyData = JSON.parse(parsedData);
            $scope.updateIframilyData(updatedIframilyData);
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESHTODO
          ) {
            $scope.updateTodoData(JSON.parse(message.data));
          } else if (
            message.type ===
            MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESH_COUNT_DOWN
          ) {
            $scope.updateCountDownData(JSON.parse(message.data));
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESH_CHORES
          ) {
            $scope.updateChoresData(JSON.parse(message.data));
          } else if (
            message.type === MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_REFRESH_MEALPLAN
          ) {
            var parsedData = message.data;
            $scope.updatedCalendarData = JSON.parse(parsedData);
            $scope.updateCalendarData($scope.updatedCalendarData);
          }
        };
      }
    }

    $scope.refreshdataOnNextday = function () {
      /* Despite the name, the backend arms this via refreshTime as a
       * PERIODIC data refresh - it fires all day, not just at midnight.
       * Painted mode only cares when the local DATE actually rolled
       * (every page showing a date must repaint); same-day firings stay
       * silent, their data updates already flow through the widget
       * hooks as targeted signals. Without the guard, every firing
       * caused a full capture-all (seen at 12:51pm and 1:32pm,
       * 2026-08-28 - one of them queued a real user edit behind 19s of
       * pointless rendering). */
      if (window.mmPaintedNotify) {
        var mmToday = new Date().toDateString();
        if (window.__mmLastRolloverDay === undefined) window.__mmLastRolloverDay = mmToday;
        if (window.__mmLastRolloverDay !== mmToday) {
          window.__mmLastRolloverDay = mmToday;
          window.mmPaintedNotify("portal", "day-rollover", null);
        }
      }
      try {
        let widgetSettingIds = [];
        for (var i = 0; i < $scope.calendarRefreshTimeout.length; i++) {
          widgetSettingIds.push($scope.calendarRefreshTimeout[i].widgetId);
        }

        for (var i = 0; i < $scope.todoRefreshTimeout.length; i++) {
          widgetSettingIds.push($scope.todoRefreshTimeout[i].widgetId);
        }

        for (var i = 0; i < $scope.choresWidgetList.length; i++) {
          widgetSettingIds.push($scope.choresWidgetList[i]);
        }

        widgetSettingIds = [...new Set(widgetSettingIds)];

        if (widgetSettingIds.length <= 0) {
          return;
        }

        let requestPayload = {
          userId: $scope.userId,
          deviceId: $scope.macaddress,
          widgetSettingIds: widgetSettingIds,
        };

        APIServices.getPortalRefreshedData(requestPayload)
          .success(function (data, status) {
            console.log("callendar call was successfull");
          })
          .error(function (data, status) {
            console.log("callendar call was unsuccessfull");
          });
      } catch (e) {
        console.log("Something went wrong");
      }
    };

    /*initialize display widget setting*/

    $scope.loadInitialWidgetSetting = function (message) {
      $scope.resetTransitionVariables();
      $scope.initializeImageExpiryThread();

      $scope.calendarCharacterLength = 30;
      if (message.data != undefined) {
        $scope.weatherWidgetList = [];
        var data = message.data;
        var imgObj = JSON.parse(data);
        
        if (imgObj.gesture != undefined) {
          $scope.gesture = imgObj.gesture;
        }

        if (imgObj.overlay != undefined) {
          $scope.overlaySetting = imgObj.overlay;
          $rootScope.updateOverLay();
        }

        $scope.userMirrorId = imgObj.userMirrorId;
        $scope.mirrorId = imgObj.mirrorId;
        $scope.userId = message.userId;
        $localStorage.userId = $scope.userId;
        var obj = JSON.parse(data);
        if(obj.widgets.length==0){
        	$scope.loading = false;
            $scope.launchChrome = false;
            return;
        }

        var payload = {
          type: MANGO_MIRROR_CONSTANT.DISPLAY_NAME_UPDATE,
          data: { displayName: obj.displayName },
        };
        $scope.sendToParent(payload);

        $scope.displayName = obj.displayName + " - Mango Display";
        $window.document.title = $scope.displayName;

        if (obj.icalWidgetIds != undefined) {
          $scope.icalCalendarWidgetList = obj.icalWidgetIds;
          if ($scope.isPreviewModeEnabled == false && $scope.isChildDisplay==false) {
            $scope.updateIcalInterval();
          }
        }

        if (obj.icalAccount != undefined) {
          $scope.icalAccountList = obj.icalAccount;
        }

        if (obj.icalCalendar != undefined) {
          $scope.icalCalendarList = obj.icalCalendar;
        }

        if (obj.choresAccount != undefined) {
          $scope.choresAccountList = obj.choresAccount;
        }
        
        if (obj.snapshotWidgetIds != undefined) {
            $scope.snapShotWidgetList = obj.snapshotWidgetIds;
            if ($scope.isPreviewModeEnabled == false && $scope.isChildDisplay==false) {
              $scope.updateSnapshotsOnLoad();
            }
        }
        
        if (obj.choresWidgetIds != undefined) {
          $scope.choresWidgetList = obj.choresWidgetIds;
          if ($scope.isPreviewModeEnabled == false && $scope.isChildDisplay==false) {
            $scope.updateChoresDataInterval(true);
          }
        }
        
        if (obj.todoWidgetIds != undefined) {
            $scope.todoWidgetList = obj.todoWidgetIds;
            if ($scope.isPreviewModeEnabled == false && $scope.isChildDisplay==false) {
              $scope.updateTodoDataInterval(true);
            }
          }

        $scope.timeZoneId = obj.timeZoneId;

        mirrorBackgroundSettings = obj.mirrorBackgroundSetting
          ? obj.mirrorBackgroundSetting
          : undefined;
        if (mirrorBackgroundSettings) {
          $scope.loadMirrorBgSettings();
        }
        $scope.goalFailureIcon = obj.goalFailureIcon;
        $scope.goalSuccessIcon = obj.goalSuccessIcon;

        $rootScope.authToken = obj.authToken;

        var emoji1 = new EmojiConvertor();
        emoji1.img_sets.apple.path =
          "js-emoji/build/emoji-data/emoji-apple-64/";
        emoji1.img_sets.apple.sheet =
          "js-emoji/build/emoji-data/sheet_apple_64.png";
        emoji1.use_sheet = false;
        emoji1.init_env();
        var auto_mode = emoji1.replace_mode;
        emoji1.img_set = "apple";
        emoji1.replace_mode = auto_mode;
        emoji1.text_mode = false;

        emoji1.replace_mod;
        document.getElementById("goalSuccess").innerHTML =
          emoji1.replace_unified(unescapeUnicode($scope.goalSuccessIcon));
        document.getElementById("goalFailure").innerHTML =
          emoji1.replace_unified(unescapeUnicode($scope.goalFailureIcon));

        goalFailureImage = new Image();
        goalSuccessImage = new Image();

        try {
          if (
            $scope.goalFailureIcon != "" &&
            $scope.goalFailureIcon != undefined
          ) {
            var failureImageCode =
              document.getElementById("goalFailure").firstChild.attributes[
                "data-codepoints"
              ].value;
            goalFailureImage.src =
              MANGO_MIRROR_CONSTANT.S3_BASE_URL +
              "apple_icons/" +
              failureImageCode +
              ".png";
          }

          if (
            $scope.goalSuccessIcon != "" &&
            $scope.goalSuccessIcon != undefined
          ) {
            var successImageCode =
              document.getElementById("goalSuccess").firstChild.attributes[
                "data-codepoints"
              ].value;
            goalSuccessImage.src =
              MANGO_MIRROR_CONSTANT.S3_BASE_URL +
              "apple_icons/" +
              successImageCode +
              ".png";
          }
        } catch (exception) {
          console.log(exception);
        }

        $scope.noOfPages = obj.widgets.length;
        $localStorage.totalPage = $scope.noOfPages;
        $scope.temppgroups = [];
        $scope.temppgroups = obj.widgets;
        $scope.groups = [];
        $scope.groups = angular.copy($scope.temppgroups);
               
        $scope.watchImageCallStatus = false;
        $scope.backgroundImageObj = obj.backgroundImageDetails;

        if($scope.backgroundImageObj!=undefined){
        	$scope.background_s3Data = obj.s3Data;
            $scope.imageBrightness = obj.backgroundImageDetails.imageBrightness;
            $scope.unsplashCollectionKeyList = obj.unsplashCollectionKeyList;
            $scope.loadAllPhotos();
        }
        
        if ($scope.iframilyWidgetList.length > 0) {
          $scope.initializeAllIframeWidget();
        }

        // The layout is now known, so anything cached from a widget that is no
        // longer here can be released.
        $scope.pruneOrphanedMediaCache();

        $timeout(function () {
          $scope.fullpageLoaded = true;
        }, 4000);
        if (!$scope.$$phase && !$scope.$root.$$phase) {
          $scope.$apply();
        }
      } else {
        var message =
          MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_WIDGETSETTING_DETAIL +
          "macaddress : " +
          $scope.macaddress +
          " major : " +
          $scope.major +
          ",minor : " +
          $scope.minor;
        var subject =
          MANGO_MIRROR_CONSTANT_ERROR_MESSAGES.ERROR_WIDGETSETTING_SUBJECT;
        //										$scope.sendAutoLog(subject,message);
      }
    };

    
    /*
     * ==============page transition
     * start==============================
     */

    $scope.resetTransitionVariables = function () {
      $scope.quoteWidgetList = [];
      $scope.newsWidgetList = [];
      $scope.stickyNotesId = [];
      $scope.snapShotWidgetList = [];
      $scope.todoWidgetList = [];
      
      $scope.bgImageTransition = false;

      if (pageTimeout) {
        $interval.cancel(pageTimeout);
      }

      if ($scope.resizeTimeout) {
        $timeout.cancel($scope.resizeTimeout);
      }

      if ($scope.reverseTimeout != undefined) {
        $timeout.cancel($scope.reverseTimeout);
        $scope.reverseTimeout = null;
      }

      if ($scope.todoAutoComplete != undefined) {
        $timeout.cancel($scope.todoAutoComplete);
        $scope.todoAutoComplete = undefined;
      }
      
//      if ($scope.fvTimer != undefined) {
//          $timeout.cancel($scope.fvTimer);
//          $scope.fvTimer = undefined;
//      }
      
      if ($scope.quotesInterval != undefined) {
        $interval.cancel($scope.quotesInterval);
      }

      if ($scope.icalInterval != undefined) {
        $interval.cancel($scope.icalInterval);
      }

      if ($scope.refreshNews != undefined) {
        $interval.cancel($scope.refreshNews);
      }

      angular.forEach($scope.snapshotList, function (widgetDetail) {
        if (widgetDetail.snapshotIntervalObject != undefined) {
          $interval.cancel(widgetDetail.snapshotIntervalObject);
        }
      });
      $scope.snapshotList = [];

      angular.forEach($scope.powerBiWidgetList, function (widgetDetail) {
        if (widgetDetail.intervalObject != undefined) {
          $interval.cancel(widgetDetail.intervalObject);
        }
        if (widgetDetail.pollingIntervalObject != undefined) {
          $interval.cancel(widgetDetail.pollingIntervalObject);
        }
      });
      $scope.powerBiWidgetList = [];

      angular.forEach($scope.imageWidgetList, function (widgetDetail) {
        if (widgetDetail.intervalObject != "") {
          $interval.cancel(widgetDetail.intervalObject);
          if (widgetDetail.timeout != "") {
            $timeout.cancel(widgetDetail.timeout);
          }
        }
      });
      $scope.imageWidgetList = [];
      
      // reset iframe
      angular.forEach($scope.iframilyWidgetList, function (widgetDetail) {
          if (widgetDetail.intervalObject != null) {
            $interval.cancel(widgetDetail.intervalObject);
          }
        });
      $scope.iframilyWidgetList = [];
      
      angular.forEach($scope.clockWidgetList, function (widgetDetail) {
        if (widgetDetail.intervalObject != "") {
          $interval.cancel(widgetDetail.intervalObject);
        }
      });

      angular.forEach($scope.countdownWidgetInterval, function (widgetDetail) {
        if (widgetDetail.intervalObject != "") {
          $interval.cancel(widgetDetail.intervalObject);
        }
      });

      $scope.countdownWidgetInterval = [];

      $scope.clockWidgetList = [];

      if ($scope.calendarScrollIntervalFlag != undefined) {
        $timeout.cancel($scope.calendarScrollTimeoutFlag);
        $interval.cancel($scope.calendarScrollIntervalFlag);
      }

      if ($scope.noBleDataUpdateTimeInterval != "") {
        $interval.cancel($scope.noBleDataUpdateTimeInterval);
        $scope.noBleDataUpdateTimeInterval = "";
      }

      if ($scope.weatherInterval != undefined) {
        $interval.cancel($scope.weatherInterval);
        $scope.weatherInterval = undefined;
      }

      if ($scope.calendarUpdateTimeout != undefined) {
        $timeout.cancel($scope.calendarUpdateTimeout);
        $scope.calendarUpdateTimeout = undefined;
      }
      if ($scope.calendarRefreshTimeout.length > 0) {
        angular.forEach($scope.calendarRefreshTimeout, function (widgetDetail) {
          if (
            widgetDetail.calendarTimeoutObject != "" ||
            widgetDetail.calendarTimeoutObject != undefined
          ) {
            $timeout.cancel(widgetDetail.calendarTimeoutObject);
          }
        });
      }

      if ($scope.updateNewsIndexInterval != undefined) {
        $interval.cancel($scope.updateNewsIndexInterval);
        $scope.updateNewsIndexInterval = undefined;
      }

      if ($scope.imageTimeOut) {
        $interval.cancel($scope.imageTimeOut);
      }

      if ($scope.imageWidgetList.length > 0) {
        angular.forEach($scope.imageWidgetList, function (imgWidget) {
          $interval.cancel(imgWidget.intervalObject);
        });
        $scope.imageWidgetList = [];
      }

      $scope.isClockInitializationRequired = true;
      $scope.isNewsResizeInitialize = false;
      $scope.newsWithDataArray = {};
      $scope.secondsLeftNextApiHit = undefined;
      $scope.quoteIndex = 0;
      $scope.transitionPage = "";

      $scope.pageCounter = 0;
      $scope.graphObjectArray = [];
      $scope.transitionPage = $("#pageTransition").children("div");
      //								$scope.transitionPage.hide();
      $scope.clockIntervalFlag = false;
      $scope.newsArrayList = [];
      $scope.automaticallyResizeContent = [];

      $scope.imageCounter = 0;
      $scope.multipleImagesCount = -1;
      $scope.allPhotos = [];
      lagendDisplayStatus = false;
      lagendreverseOrder = false;
      lagendPointerIcon = false;
      $scope.imageWidgetList = [];
    };

    $scope.load = function () {
      $scope.transitionPage = "";
      /* designer mode pins the portal to the page the layout editor is on */
      $scope.quoteIndex =
        $scope.isDesignerModeEnabled === true &&
        $scope.designerPageIndex > 0 &&
        $scope.groups &&
        $scope.designerPageIndex < $scope.groups.length
          ? $scope.designerPageIndex
          : 0;
      if ($scope.isDesignerModeEnabled === true && $scope.groups) {
        var designerPinnedPage = $scope.groups[$scope.quoteIndex];
        if (!$scope.isRenderablePage(designerPinnedPage)) {
          $scope.pageCounter = 0;
          $scope.loading = false;
          $scope.postDesignerPageStatus(designerPinnedPage, true);
          return;
        }
      } else {
        $scope.quoteIndex = $scope.getRenderablePageIndex($scope.quoteIndex, 1);
      }
      $scope.pageCounter = 0;
      $scope.loading = false;
      $scope.transitionPage = $("#pageTransition").children("div");
      //								$scope.transitionPage.hide();
      $scope.clearDesignerBackgroundIfDisabled();
      $timeout(showNextPage);
      /* the whole layout has been applied and the first page asked to
       * show - queued behind showNextPage so it cannot report a page that
       * has not been told to render yet. paintedMode still waits for
       * images and two frames before it calls this settled. */
      if (window.mmPaintedNotify) {
        $timeout(function () {
          window.mmPaintedNotify("reload", null, null);
        });
      }
      $scope.multipleImagesCount = -1;
      $scope.imageTransition = "";
      if ($scope.isDesignerModeEnabled === true && window.parent !== window) {
        /* tell the embedding layout editor the page has rendered, so it can
         * swap this document in without guessing at a settle time */
        $timeout(function () {
          try {
            /* the boot sequence paints the background photo before the page
             * pin; on a rotating display the page transition would clear it
             * for background-off pages, but pinned pages never transition —
             * clear it here so the preview matches the real display */
            $scope.clearDesignerBackgroundIfDisabled();
          } catch (e) {}
          /* only signal ready once every image the page uses — <img> tags
           * AND css background layers — has finished loading: fading in a
           * half-painted document reads as a blink in the editor. Capped
           * so a broken image can never stall the swap. */
          var signalDesignerReady = function () {
            var readyPage = $scope.groups && $scope.groups[$scope.quoteIndex];
            $scope.postDesignerPageStatus(readyPage, false);
            window.parent.postMessage(
              {
                type: "mm-designer-ready",
                isPageBlank: false,
                page: $scope.designerPageIndex,
                pageIndex: $scope.designerPageIndex,
                pageNumber: $scope.designerPageIndex + 1,
                pageId: readyPage && readyPage.pageId,
              },
              "*"
            );
          };
          try {
            var pendingImages = [];
            var trackImage = function (src) {
              pendingImages.push(
                new Promise(function (resolve) {
                  var probe = new Image();
                  probe.onload = resolve;
                  probe.onerror = resolve;
                  probe.src = src;
                  if (probe.complete) {
                    resolve();
                  }
                })
              );
            };
            Array.prototype.forEach.call(document.images, function (img) {
              if (!img.complete && img.src) {
                trackImage(img.src);
              }
            });
            Array.prototype.forEach.call(
              document.querySelectorAll("body *"),
              function (node) {
                var bg = getComputedStyle(node).backgroundImage || "";
                var match = bg.match(/url\(["']?([^"')]+)["']?\)/);
                if (match && match[1]) {
                  trackImage(match[1]);
                }
              }
            );
            if (pendingImages.length === 0) {
              signalDesignerReady();
            } else {
              var readySent = false;
              var finishReady = function () {
                if (!readySent) {
                  readySent = true;
                  signalDesignerReady();
                }
              };
              Promise.all(pendingImages).then(finishReady);
              setTimeout(finishReady, 4000);
            }
          } catch (e) {
            signalDesignerReady();
          }
        }, 600);
      }
    };

    /*
     * This function is use to display multiple images
     * if multiple image status is true
     */
    $scope.unsplashPhotoDetails = function (count) {
      $scope.unsplashName = $scope.allPhotos[count].name;
      $scope.unsplashUserName = $scope.allPhotos[count].userName;
      $scope.unsplashPhotoUrl = $scope.allPhotos[count].downloadLocation;
    };

    $scope.fetchAndCache = function (url, cacheName) {
      const deferred = $q.defer();
      const encodedUrl = encodeURI(url);

      caches
        .open(cacheName)
        .then((cache) => {
          return cache.match(encodedUrl).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse.clone();
            } else {
              // Fetch and cache
              return fetch(encodedUrl).then((response) => {
                if (!response.ok) {
                  throw new Error(`HTTP error! Status: ${response.status}`);
                }
                cache.put(encodedUrl, response.clone());
                return response.clone();
              });
            }
          });
        })
        .then((response) => {
          deferred.resolve(response);
        })
        .catch((error) => {
          console.error("Error fetching resource:", error);
          deferred.reject(error);
        });

      return deferred.promise;
    };

    $scope.setBackgroundImage = function (
      element,
      imageUrl,
      mode = "cover",
      brightness
    ) {
      if (element) {
        element.style.background =
          'url("' + imageUrl + '") center center / ' + mode + " no-repeat";
        element.style.filter = "brightness(" + brightness + ")";
      }
    };

    $scope.drawBgImage = function () {
      const bgImageId1 = document.getElementById("bg_img_1");
      const bgImageId2 = document.getElementById("bg_img_2");
      const timer = 3200;

      if (
        $scope.groups[$scope.quoteIndex].isBackgroundImage != undefined &&
        $scope.groups[$scope.quoteIndex].isBackgroundImage
      ) {
        if ($scope.bgImageTransition) {
          $scope.setBackgroundImage(
            bgImageId2,
            $scope.allPhotos[0].regular,
            $scope.backgroundImageObj.isCropToFill ? "cover" : "contain",
            $scope.imageBrightness
          );
          $timeout(() => {
            if (bgImageId1 != undefined && $scope.allPhotos.length > 0) {
              $scope.setBackgroundImage(
                bgImageId1,
                $scope.allPhotos[0].regular,
                $scope.backgroundImageObj.isCropToFill ? "cover" : "contain",
                $scope.imageBrightness
              );
            }
          }, timer);
        } else {
          $scope.setBackgroundImage(
            bgImageId1,
            $scope.allPhotos[0].regular,
            $scope.backgroundImageObj.isCropToFill ? "cover" : "contain",
            $scope.imageBrightness
          );
          $timeout(() => {
            if (bgImageId2 != undefined && $scope.allPhotos.length > 0) {
              $scope.setBackgroundImage(
                bgImageId2,
                $scope.allPhotos[0].regular,
                $scope.backgroundImageObj.isCropToFill ? "cover" : "contain",
                $scope.imageBrightness
              );
            }
          }, timer);
        }
      } else {
        bgImageId1.style.background = "url()";
        bgImageId2.style.background = "url()";
      }

      if ($scope.allPhotos.length > 1) {
        if ($scope.bgImageTransition == true) {
          $timeout(function () {
            document
              .getElementById("bg_img_1")
              .classList.remove("image-loaded");
            var tempImage = document.getElementById("bg_img_2");
            tempImage.classList.add("image-loaded");
          });
        } else {
          $timeout(function () {
            var tempImage = document.getElementById("bg_img_2");
            tempImage.classList.remove("image-loaded");
            document.getElementById("bg_img_1").classList.add("image-loaded");
          });
        }
        $scope.bgImageTransition = !$scope.bgImageTransition;
      } else {
        document.getElementById("bg_img_1").classList.add("image-loaded");
      }
    };

    $scope.checkIndex = function () {
      if ($scope.quoteIndex < 0) {
        $timeout(function () {
          $scope.checkIndex();
        }, 100);
      } else {
        return true;
      }
    };

    $scope.showBackgroundImages = function () {
      if ($scope.checkIndex()) {
        try {
          if (
            $scope.groups[$scope.quoteIndex].isBackgroundImage != undefined &&
            $scope.groups[$scope.quoteIndex].isBackgroundImage
          ) {
            $scope.isBgEnabled = true;
            if ($scope.allPhotos.length > 0) {
              $scope.watchImageCallStatus = true;
              $scope.drawBgImage();
              $scope.allPhotos.splice(0, 1);
            }
            if ($scope.imageTimeOut) {
              $interval.cancel($scope.imageTimeOut);
            }
            $scope.imageTimeOut = $interval($scope.checkImageTimeOut, 1000);
          } else {
            $scope.isBgEnabled = false;
            $timeout(
              $scope.showBackgroundImages,
              $scope.groups[$scope.quoteIndex].delay
            );
          }
        } catch (e) {
          $scope.photoArraSizeStatus = false;
          $scope.randomCount = 0;
          console.log("error in multiple image" + e);
          $scope.showBackgroundImages();
        }
      }
    };

    $scope.checkImageTimeOut = function () {
      if (
        $scope.groups[$scope.quoteIndex].isBackgroundImage != undefined &&
        $scope.groups[$scope.quoteIndex].isBackgroundImage
      ) {
        $scope.imageCounter++;
      }

      $scope.multipleImagesDelayTime = $scope.backgroundImageObj.imageDelayTime;
      if ($scope.imageCounter >= $scope.multipleImagesDelayTime) {
        $scope.imageCounter = 0;

        var minutesDifference = 0;
        if (
          $scope.backgroundImageObj.appleAccessToken != undefined &&
          $scope.backgroundImageObj.isAppleImage != undefined &&
          $scope.backgroundImageObj.isAppleImage &&
          $localStorage.appleAccessToken != undefined
        ) {
          minutesDifference = moment().diff(
            moment($localStorage.appleAccessToken),
            "minutes"
          );
        }

        var isUpdateNeeded = false;
        if ($scope.allPhotos.length == 0) {
          $scope.allPhotos.length = 0;
          isUpdateNeeded = true;
        } else if ($scope.allPhotos.length == 1) {
          if (
            ($scope.backgroundImageObj.isGoogleImage != undefined &&
              $scope.backgroundImageObj.isGoogleImage) ||
            ($scope.backgroundImageObj.isAppleImage != undefined &&
              $scope.backgroundImageObj.isAppleImage) ||
            ($scope.backgroundImageObj.isDefaultUnsplashImage != undefined &&
              $scope.backgroundImageObj.isDefaultUnsplashImage) ||
            ($scope.backgroundImageObj.isUnsplashImage != undefined &&
              $scope.backgroundImageObj.isUnsplashImage) ||
            ($scope.backgroundImageObj.isS3Enabled != undefined &&
              $scope.backgroundImageObj.isS3Enabled &&
              $scope.backgroundImageObj.s3Data != undefined &&
              $scope.backgroundImageObj.s3Data != undefined &&
              $scope.backgroundImageObj.s3Data.length > 1)
          ) {
            isUpdateNeeded = true;
          }
        }

        if (minutesDifference > 60) {
          $scope.allPhotos.length = 0;
          isUpdateNeeded = true;
        }

        if (isUpdateNeeded == true) {
          $scope.watchImageCallStatus = false;
          $scope.loadAllPhotos();
          return;
        }

        if ($scope.imageTimeOut) {
          $interval.cancel($scope.imageTimeOut);
        }

        if ($scope.allPhotos.length > 0) {
          $scope.showBackgroundImages();
        }
      }
    };

    $scope.renderHTML = function (htmlContent) {
      return $sce.trustAsHtml(htmlContent);
    };

    $scope.checkAndUpdatePageBg = function () {
      if (
        $scope.groups[$scope.quoteIndex].isBackgroundImage != undefined &&
        $scope.groups[$scope.quoteIndex].isBackgroundImage
      ) {
        $scope.isBgEnabled = true;
      } else {
        $scope.isBgEnabled = false;
      }
    };

    function showNextPage() {
      try {
        $scope.transitionPage = $("#pageTransition").children("div");
        var image = $("#bg_img_1");
        $scope.checkAndUpdatePageBg();

        $timeout(function () {
          $scope.showCurrentPageImageWidget();
          if ($scope.quoteIndex > 0) {
            $scope.resizeIframeWidget($scope.quoteIndex);
          }
        }, 100);

        $scope.delayTime = $scope.groups[$scope.quoteIndex].delay;
        $scope.pinnedWidgetId = $scope.groups[$scope.quoteIndex].pinnedWidegtId;
        $timeout($scope.autoResizeByPageNumber($scope.quoteIndex));

        $timeout(function () {
          var currentPage = $scope.groups[$scope.quoteIndex];
          var currentPageId = currentPage && currentPage.pageId;

          // Rotation can skip blank pages, so quoteIndex - 1 is not always the
          // page that was previously visible. Reset every other page to avoid
          // stale content remaining composited behind iframe/video widgets.
          angular.forEach($scope.transitionPage, function (pageElement) {
            var isCurrentPage = pageElement.id == currentPageId;
            pageElement.style.zIndex = isCurrentPage ? "999" : "998";
            if (isCurrentPage) {
              pageElement.classList.add("image-loaded");
            } else {
              pageElement.classList.remove("image-loaded");
            }
          });
          
          
          if($scope.userId==355){
        	  var stepsWidgetPresent = false;
    		  angular.forEach($scope.groups[$scope.quoteIndex].widgets,function(value) {
    								if (value.viewType === "graph" && value.status === "on") {
    									stepsWidgetPresent = true;
    									return;
    								}
    							});
    		  if (stepsWidgetPresent) {
    			  $scope.drawGraphs();
    			  }  
          }
        }, 800);

        if ($scope.shouldAutoRotatePages()) {
          if (pageTimeout) {
            $interval.cancel(pageTimeout);
          }
          pageTimeout = $interval($scope.checkPageTimeOut, 1000);
        }
      } catch (e) {
        if ($scope.groups.length < $scope.quoteIndex) {
          $scope.quoteIndex = 0;
          $timeout(showNextPage);
        } else {
          $scope.refreshWidget();
        }
      }
    }

    $scope.checkPageTimeOut = function () {
      if (!$scope.shouldAutoRotatePages()) {
        $scope.pageCounter = 0;
        if (pageTimeout) {
          $interval.cancel(pageTimeout);
        }
        return;
      }
      $scope.pageCounter++;
      if ($scope.pageCounter >= $scope.delayTime) {
        $scope.pageCounter = 0;
        $scope.quoteIndex = $scope.getRenderablePageIndex(
          $scope.quoteIndex + 1,
          1
        );
        if (pageTimeout) {
          $interval.cancel(pageTimeout);
        }
        showNextPage();
      }
    };

    $scope.initializePageTransition = function (outerIndex, innerIndex) {
      if (
        $scope.groups.length - 1 === outerIndex &&
        $scope.groups[$scope.groups.length - 1].widgets.length - 1 ===
          innerIndex
      ) {
        $scope.load();
      }
    };

    $scope.drawGraphs = function () {
      try {
        angular.forEach(
          $scope.groups[$scope.quoteIndex].widgets,
          function (value, key) {
            if (value.viewType === "graph" && value.status === "on") {
              $scope.data = angular.copy(value);

              if ($scope.data.data != null) {
                if ($scope.data.data.type != "subscriptionError") {
                  /*
                   * || $scope.data.data.type !=
                   * 'rescueTimeAccessRevokedError'
                   */
                  if (
                    $scope.data.data.type != "fitbitAccessRevokedError" &&
                    $scope.data.data.type != "rescueTimeAccessRevokedError"
                  ) {
                    var canvasId =
                      value.contentType + "_canvas_" + value.contentId;
                    var elemetId = document.getElementById(
                      canvasId + "_" + $scope.quoteIndex
                    );

                    // this code is used to
                    // check if canvas is
                    // fully loaded or not
                    if (elemetId === null) {
                      $timeout($scope.drawGraphs, 500);
                      return;
                    }
                    $timeout(
                      $scope.loadStackedGraph(
                        canvasId + "_" + $scope.quoteIndex,
                        $scope.data
                      ),
                      100
                    );
                  }
                }
              }
            }
          }
        );
      } catch (e) {
        console.log(e);
      }
    };

    $scope.stopPageTransition = function () {
      if (pageTimeout) {
        $interval.cancel(pageTimeout);
      }
    };

    $scope.startPageTransition = function () {
      if ($scope.shouldAutoRotatePages()) {
        if (pageTimeout) {
          $interval.cancel(pageTimeout);
        }
        pageTimeout = $interval($scope.checkPageTimeOut, 1000);
      }
    };

    /*
     * ===============================update widget
     * setting=============================
     */

    $scope.updateWidgetSetting = function (pagenumber) {
      // wait for few seconds before updating server
      // to make sure user is done with the changes
      // and also lets save some server calls
      if (updateSettingTimerId) {
        $timeout.cancel(updateSettingTimerId);
      }

      updateSettingTimerId = $timeout(function () {
        var updatedHeight,
          updatedWidth,
          offset,
          xPos,
          yPos,
          contentId,
          minHeight,
          minWidth;
        $scope.number = 0;

        angular.forEach($scope.groups, function (group) {
          if (pagenumber === group.pageId) {
            angular.forEach(group.widgets, function (widget, key) {
              if (widget.status === "on") {
                updatedHeight = angular
                  .element("#" + widget.widgetSettingId)
                  .children()
                  .children()
                  .height();
                updatedWidth = angular
                  .element("#" + widget.widgetSettingId)
                  .children()
                  .children()
                  .width();
                offset = angular.element("#" + widget.widgetSettingId).offset();
                xPos = offset.left;
                yPos = offset.top;
                widget.xPos = xPos;
                widget.yPos = yPos;
                widget.height = updatedHeight;
                widget.width = updatedWidth;
                $scope.updatedData = widget;
                var data = {
                  type: "updateWidgetSetting",
                  userId: $scope.userId,
                  major: $scope.major,
                  minor: $scope.minor,
                  value: $scope.updatedData,
                  height: $scope.bodyHeight,
                  width: $scope.bodyWidth,
                };
                $scope.updateData = JSON.stringify(data);
                taskSocket.send($scope.updateData);
              }
            });
          }
        });
        $scope.startPageTransition();
      }, 3000);
    };

    /*
     * ========================socket event handler
     * code================================================
     */

    $scope.checkInternetConnectionAndReload = function () {
      $q.all([
        $http({
          method: "GET",
          url: MANGO_MIRROR_CONSTANT.API_HEALTH_CHECK_URL,
          headers: {
            "Content-Type": "application/json",
            "accept-language": "en-US, en; q = 0.8",
          },
        }),
        $http({
          method: "GET",
          url: MANGO_MIRROR_CONSTANT.SOCKETAPI_HEALTH_CHECK_URL,
          headers: {
            "Content-Type": "application/json",
            "accept-language": "en-US, en; q = 0.8",
          },
        }),
      ])
        .then(function (responses) {
          if ($scope.currentOrientation === 0) {
            window.location.reload();
          } else {
            var payload = { type: MANGO_MIRROR_CONSTANT.DISPLAY_RESIZED };
            $scope.sendToParent(payload);
          }
        })
        .catch(function (error) {
          // This runs if ANY one fails
          $timeout($scope.checkInternetConnectionAndReload, 3000);
        });

      //								 $http({
      //									  method : "GET",
      //								      url : MANGO_MIRROR_CONSTANT.API_HEALTH_CHECK_URL,
      //								      headers: {
      //									        "Content-Type": "application/json",
      //									        "accept-language":"en-US, en; q = 0.8"
      //									      },
      //									  }).then(function(res) {
      //										  if($scope.currentOrientation===0){
      //									    		window.location.reload();
      //									    	}else{
      //									    		var payload = { type: MANGO_MIRROR_CONSTANT.DISPLAY_RESIZED };
      //												$scope.sendToParent(payload);
      //									    	}
      //									    },
      //									    function(error) {
      //									    	$timeout($scope.checkInternetConnectionAndReload,3000);
      //								    	})
    };

    $scope.socketCheckInitialization = function () {
      $interval.cancel($scope.socketIntervalTimeout);
      if (
        $scope.socketIntervalTimeout == undefined &&
        $rootScope.isAppInBackground == false
      ) {
        $scope.socketIntervalTimeout = $interval(
          $scope.checkSocketConnection,
          Math.floor(Math.random() * 270001) + 30000
        );
      }
    };

    $scope.socketDataLoadCheckInitialization = function () {
      $timeout(function () {
        if ($scope.isDataLoadedThroughSocket == false) {
          $scope.checkInternetConnectionAndReload();
        }
      }, Math.floor(Math.random() * (300000 - 120000 + 1)) + 120000);
    };

    $scope.checkSocketConnection = function () {
      if ($rootScope.isAppInBackground == true) {
        $interval.cancel($scope.socketIntervalTimeout);
        return;
      }

      if (!$scope.socketStatus) {
        $interval.cancel($scope.socketIntervalTimeout);
        $scope.toasterMessage("Socket reconnecting ...");
        $scope.checkInternetConnectionAndReload();
      }

      if ($scope.socketStatus) {
        $scope.socketStatus = false;
        try {
          socketConnectionCheckData = {
            type: MANGO_MIRROR_CONSTANT.CHECK_SOCKET_STATUS,
            deviceId: $scope.macaddress,
          };
          $scope.socketCheckRequestBody = JSON.stringify(
            socketConnectionCheckData
          );
          taskSocket.send($scope.socketCheckRequestBody);
        } catch (exception) {
          $interval.cancel($scope.socketIntervalTimeout);
        }
      }
    };

    function unescapeUnicode(str) {
      return str.replace(/\\u([a-fA-F0-9]{4})/g, function (g, m1) {
        return String.fromCharCode(parseInt(m1, 16));
      });
    }

    /*
     * ========================pop up toaster if any
     * error message need to
     * show====================
     */

    $scope.toasterMessage = function (message, time = 3000) {
      window.toastr.error(message, "", {
        timeOut: time,
        extendedTImeout: 3000,
        allowHtml: true,
      });
    };

    /*
     * ========================update widget data if
     * modified from ios side====================
     */

    // call widget setting with new updated value
    $scope.refreshWidget = function () {
      getWidgetSetting = {
        type: MANGO_MIRROR_CONSTANT.MESSAGE_TYPE_GET_WIDGETSETTING,
        userId: $scope.userId,
        major: $scope.major,
        minor: $scope.minor,
        deviceId: $scope.macaddress,
        height: $scope.bodyHeight,
        width: $scope.bodyWidth,
        preview: false,
      };
      $scope.socketMessage = JSON.stringify(getWidgetSetting);
      taskSocket.send($scope.socketMessage);
    };

    /*// call android reset function
							$scope.callAndroidResetFunction = function()
							{
								if( wv ) {
									try
									{
										window.JavaAndJavascriptBridge.resetMirror();										
									}catch (e) {
										console.log(e);
									}
								}								
							}
							// call android nighMode function
							$scope.callAndroidNightModeFunction = function(obj)
							{
							    if( wv ) {
							    	try
									{
							    		var str = JSON.stringify(obj)
								    	window.JavaAndJavascriptBridge.nightMode(str);										
									}catch (e) {
										console.log(e);
									}									
							    }								
							}
							
							$scope.callAndroidAutoStartFunction = function(obj)
							{
								if( wv ) {
									try
									{
										var str = JSON.stringify(obj)
								    	window.JavaAndJavascriptBridge.autoStartPortal(str);	
									}catch (e) {
										console.log(e);
									}									
								}								
							}
							
							// call android reset function
							$scope.callAndroidUpdateOrientaionFunction = function(obj)
							{
							    if( wv ) {
							    	try
									{
							    		window.JavaAndJavascriptBridge.updateOrientation(obj);	
									}catch (e) {
										console.log(e);
									}
								}								
							}*/

    $scope.removedExistingImageSetting = function (widgetSettingId) {
      for (var i = 0; i < $scope.imageWidgetList.length; i++) {
        if ($scope.imageWidgetList[i].widgetId == widgetSettingId) {
          if ($scope.imageWidgetList[i].intervalObject != undefined) {
            $interval.cancel($scope.imageWidgetList[i].intervalObject);
            if ($scope.imageWidgetList[i].timeout != "") {
              $timeout.cancel($scope.imageWidgetList[i].timeout);
            }
          }
          $scope.imageWidgetList.splice(i, 1);
        }
      }
    };

    $scope.removeExistingGifSetting = function (widgetSettingId) {
      for (var i = 0; i < $scope.gifWidgetList.length; i++) {
        if ($scope.gifWidgetList[i].widgetId == widgetSettingId) {
          $scope.gifWidgetList.splice(i, 1);
        }
      }
    };

    $scope.checkAndRemoveCurrentRendering = function (updatedImageWidgetData) {
      for (var i = 0; i < $scope.imageWidgetList.length; i++) {
        if (
          $scope.imageWidgetList[i].widgetId ==
            updatedImageWidgetData.widgetId &&
          $scope.imageWidgetList[i].pagenumber.includes($scope.quoteIndex)
        ) {
          var widgetData = updatedImageWidgetData.imageWidgetSetting;
          if (
            widgetData != undefined &&
            widgetData.isAppleImage == false &&
            widgetData.isGoogleImage == false &&
            widgetData.isImageUrlEnable == false &&
            widgetData.isS3Enabled == false &&
            widgetData.isUnsplashImage == false
          ) {
            var imgId = document.getElementById(
              "img_" + updatedImageWidgetData.widgetId + "_" + $scope.quoteIndex
            );
            if (imgId != null) {
              imgId.style.background = "";
            }
          }
        }
      }
    };

    $scope.updateImageWidgetData = function (updatedImageWidgetData) {
      if (window.mmPaintedNotify) window.mmPaintedNotify("socket", "image", updatedImageWidgetData && updatedImageWidgetData.widgetId);
      var dataToInitialize = [];
      $scope.checkAndRemoveCurrentRendering(updatedImageWidgetData);
      $scope.removedExistingImageSetting(updatedImageWidgetData.widgetId);
      for (var i = 0; i < $scope.groups.length; i++) {
        for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
          widgerData = $scope.groups[i].widgets[j];
          if (widgerData.type != "subscriptionError") {
            if (
              $scope.groups[i].widgets[j].widgetSettingId ==
              updatedImageWidgetData.widgetId
            ) {
              $scope.groups[i].widgets[j].data = updatedImageWidgetData;
              $scope.initializeImageWidget($scope.groups[i].widgets[j], i);
              continue;
            }
          }
        }
      }
      $scope.$apply();
    };

    $scope.updateGifWidgetData = function (updatedGifWidgetData) {
      $scope.removeExistingGifSetting(updatedGifWidgetData.widgetId);
      for (var i = 0; i < $scope.groups.length; i++) {
        for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
          widgetData = $scope.groups[i].widgets[j];
          if (widgetData.type != "subscriptionError") {
            if (
              $scope.groups[i].widgets[j].widgetSettingId ==
              updatedGifWidgetData.widgetId
            ) {
              $scope.groups[i].widgets[j].data.gifWidgetSetting =
                updatedGifWidgetData.gifWidgetSetting;
              //												$scope.initializeGifWidget($scope.groups[i].widgets[j], i);
              continue;
            }
          }
        }
      }
      $scope.$apply();
    };

    // weather update code
    $scope.updateWeatherData = function (updatedWeather) {
      if (window.mmPaintedNotify) window.mmPaintedNotify("socket", "weather", Object.keys(updatedWeather || {}));
      angular.forEach(updatedWeather, function (weatherData, widgetId) {
        for (var i = 0; i < $scope.groups.length; i++) {
          for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
            var widgerData = $scope.groups[i].widgets[j];
            if (widgerData.type != "subscriptionError") {
              if (
                $scope.groups[i].widgets[j].widgetSettingId ==
                parseInt(widgetId)
              ) {
                $scope.groups[i].widgets[j].data = weatherData;
                $scope.$apply();
                continue;
              }
            }
          }
        }

        $timeout(function () {
          $scope.resizeWeatherFont();
        }, 100);
      });
    };

    clearNewsWidgetsData = function () {};

    $scope.updateNewsData = function (updatedNewsData) {
      if (window.mmPaintedNotify) window.mmPaintedNotify("socket", "news", Object.keys(updatedNewsData || {}));
      angular.forEach(updatedNewsData, function (newsData, widgetId) {
        for (var i = 0; i < $scope.groups.length; i++) {
          for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
            var widgetData = $scope.groups[i].widgets[j];
            if (widgetData.type != "subscriptionError") {
              if (
                $scope.groups[i].widgets[j].widgetSettingId ==
                parseInt(widgetId)
              ) {
                $scope.groups[i].widgets[j].data = newsData;
                $scope.$apply();
                continue;
              }
            }
          }
        }

        $timeout(function () {
          $scope.resizeNewsFont();
        }, 100);
      });
    };

    $scope.newsDataUpdateTimer = undefined;
    $scope.updateNewsStartIndex = function () {
      try {
        var isResizeNeeded = false;
        for (var i = 0; i < $scope.newsWidgetList.length; i++) {
          if ($scope.newsWidgetList[i].pagenumber.includes($scope.quoteIndex)) {
            isResizeNeeded = true;
          }
          var newsData = $scope.newsWidgetList[i].widgetSetting;
          var currentNewsCycle = $scope.newsWidgetList[i].newsCycle;
          if (
            (currentNewsCycle + 1) * newsData.data.newsWidgetSetting.newsCount <
            newsData.data.data.length
          ) {
            currentNewsCycle = currentNewsCycle + 1;
            index =
              currentNewsCycle * newsData.data.newsWidgetSetting.newsCount;
          } else {
            currentNewsCycle = 0;
            index = 0;
          }
          newsData.data.startIndex = index;
          $scope.newsWidgetList[i].newsCycle = currentNewsCycle;
          if (isResizeNeeded) {
            isResizeNeeded = false;
            $timeout($scope.resizeNewsFont, 100);
          }
        }
      } catch (e) {
        console.log("updating news index caused the issue");
        // TODO: handle exception
      }
    };

    $scope.startNewsSinglePageThread = function () {
      if ($scope.updateNewsIndexInterval != undefined) {
        $interval.cancel($scope.updateNewsIndexInterval);
      }
      $scope.updateNewsIndexInterval = $interval(
        $scope.updateNewsStartIndex,
        300000
      );
    };

    // update step data
    $scope.updateStepsData = function (updatedStepsData) {
      var stepCount = 0;
      $scope.updatedHealthData = updatedStepsData;
      $scope.automaticallyResizeContent = [];
      angular.forEach($scope.updatedHealthData.data, function (widgetData) {
        var healthDataType = widgetData.widget.type;
        var healthDataMasterCategory = widgetData.widget.masterCategory;
        var healthDataSubCategory = widgetData.widget.subCategory;
        stepCount = 0;
        angular.forEach($scope.groups, function (group) {
          angular.forEach(group.widgets, function (value, key) {
            if (value.data.type != "subscriptionError") {
              if (
                healthDataType == value.contentType &&
                healthDataMasterCategory == value.widgetMasterCategory &&
                healthDataSubCategory == value.widgetSubCategory
              ) {
                if (
                  widgetData.data.type == "fitbitAccessRevokedError" ||
                  widgetData.data.type == "rescueTimeAccessRevokedError"
                ) {
                  value.data = widgetData.data;
                } else {
                  if (
                    value.contentType ==
                      MANGO_MIRROR_CONSTANT.WIDGET_TYPE_BLOOD_PRESSURE_SYSTOLIC ||
                    value.contentType ==
                      MANGO_MIRROR_CONSTANT.WIDGET_TYPE_HEART_RATE
                  ) {
                    value.data.datasets[0].data =
                      widgetData.data.datasets[0].data;
                    value.data.datasets[1].data =
                      widgetData.data.datasets[1].data;
                  } else if (
                    value.widgetMasterCategory ==
                    MANGO_MIRROR_CONSTANT.WIDGET_MASTER_CATEGORY_RESCUETIME
                  ) {
                    value.data.datasets = widgetData.data.datasets;
                  } else {
                    value.data.datasets[0].data =
                      widgetData.data.datasets[0].data;
                  }
                  value.data.labels = widgetData.data.labels;
                  value.data.unit = widgetData.data.unit;
                  value.data.goalValue = widgetData.data.goalValue;
                  value.data.maxValue = widgetData.data.maxValue;
                  value.data.minValue = widgetData.data.minValue;
                  value.data.todaysData = widgetData.data.todaysData;
                  value.data.DataLastUpdatedTime =
                    widgetData.data.DataLastUpdatedTime;

                  var myLineChart;
                  $scope.data = angular.copy(value);
                  angular.forEach(
                    $scope.graphObjectArray,
                    function (graphdata) {
                      if (
                        graphdata.graphInstanceId ==
                        value.contentType +
                          "_canvas_" +
                          value.contentId +
                          "_" +
                          stepCount
                      ) {
                        myLineChart = graphdata.chartInstanceId;
                        myLineChart.destroy();
                        $timeout(
                          $scope.loadStackedGraph(
                            value.contentType +
                              "_canvas_" +
                              value.contentId +
                              "_" +
                              stepCount,
                            $scope.data
                          ),
                          200
                        );
                      }
                    }
                  );
                  $scope.automaticallyResizeContent.push(value);
                }
              }
            }
          });
          stepCount = stepCount + 1;
        });
      });
      $timeout($scope.graphResize, 100);
    };

    $scope.checkAndRemoveCurrentPdfImgRendering = function (
      updatedPdfWidgetData
    ) {
      for (var i = 0; i < $scope.imageWidgetList.length; i++) {
        if (
          $scope.imageWidgetList[i].widgetId == updatedPdfWidgetData.widgetId &&
          $scope.imageWidgetList[i].pagenumber.includes($scope.quoteIndex)
        ) {
          var widgetData = updatedPdfWidgetData.iframeDetail;
          if (
            widgetData != undefined &&
            (updatedPdfWidgetData.pdfImages == undefined ||
              updatedPdfWidgetData.pdfImages.length == 0)
          ) {
            var imgId = document.getElementById(
              "iframily_" +
                updatedPdfWidgetData.widgetId +
                "_" +
                $scope.quoteIndex
            );
            if (imgId != null) {
              imgId.style.background = "";
            }
          }
        }
      }
    };

    // iframely update code
    $scope.updateIframilyData = function (updatedIframilyData) {
      updatedIframilyData = updatedIframilyData.refreshIframilyData;
      $scope.removeOldMappedIframeData(updatedIframilyData.widgetId);
      $scope.checkAndRemoveCurrentPdfImgRendering(updatedIframilyData);
      $scope.removedExistingImageSetting(updatedIframilyData.widgetId);

      for (var i = 0; i < $scope.groups.length; i++) {
        for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
          widgetData = $scope.groups[i].widgets[j];
          if (widgetData.type != "subscriptionError") {
            if (widgetData.widgetSettingId == updatedIframilyData.widgetId) {
              // Runs before the old data object is dropped: revokes its blob:
              // URL and evicts the superseded video, which is unreachable once
              // this object is gone.
              $scope.discardReplacedMediaUrl(
                $scope.groups[i].widgets[j].data,
                updatedIframilyData,
                "baseurl",
                "processedBaseurl",
                "trustedVideoUrl",
                updatedIframilyData.widgetId
              );
              $scope.groups[i].widgets[j].data = updatedIframilyData;
              if (widgetData.contentType == "pdf") {
                if (
                  updatedIframilyData.pdfImages != null &&
                  updatedIframilyData.pdfImages.length > 0
                ) {
                  $scope.mapImageData(widgetData, i);
                  if (widgetData.data.pdfImages != null) {
                    $scope.loadS3Url(widgetData);
                  }
                }
              } else {
                if ($scope.isMicrosoftOfficeS3Content($scope.groups[i].widgets[j])) {
                  $scope.groups[i].widgets[j].data.isLoading = false;
                  $scope.groups[i].widgets[j].data.iframilyHtmlLoaded = false;
                } else {
                  $scope.groups[i].widgets[j].data.isLoading = true;
                }
                $scope.initializeIframilyWidget($scope.groups[i].widgets[j], i);
              }
              continue;
            }
          }
        }
      }
      $scope.$apply();
    };

    $scope.updateCountDownData = function (updatedCountDown) {
      if (window.mmPaintedNotify) window.mmPaintedNotify("socket", "countdown-setting", Object.keys(updatedCountDown || {}));
      angular.forEach(
        updatedCountDown,
        function (updatedCountDownData, widgetId) {
          for (var i = 0; i < $scope.groups.length; i++) {
            for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
              var widgerData = $scope.groups[i].widgets[j];
              if (widgerData.type != "subscriptionError") {
                if (
                  $scope.groups[i].widgets[j].widgetSettingId ==
                  parseInt(widgetId)
                ) {
                  $scope.groups[i].widgets[j].data = updatedCountDownData;
                  $scope.$apply();
                  $scope.initializeCountDown($scope.groups[i].widgets[j]);
                  continue;
                }
              }
            }
          }
        }
      );
    };

    $scope.clearChoresExistingObject = function (widgetSettingId) {
      for (var i = 0; i < $scope.choresWidgetInterval.length; i++) {
        if ($scope.choresWidgetInterval[i].widgetId == widgetSettingId) {
          $scope.choresWidgetInterval.splice(i, 1);
        }
      }
    };

    $scope.updateChoresExistingWidgetList = function (
      widgetSettingId,
      operation
    ) {
      var foundIndex = -1;
      if ($scope.choresWidgetList.length > 0) {
        for (var i = 0; i < $scope.choresWidgetList.length; i++) {
          if ($scope.choresWidgetList[i] == widgetSettingId) {
            foundIndex = i;
          }
        }
      }

      if (operation == "add") {
        if (foundIndex == -1) {
          $scope.choresWidgetList.push(widgetSettingId);
        }
      } else if (operation == "remove") {
        if (foundIndex > -1) {
          $scope.choresWidgetList.splice(foundIndex, 1);
        }
      }
    };

    $scope.updateChoresData = function (updatedChoresData) {
      if (window.mmPaintedNotify) window.mmPaintedNotify("socket", "chores", Object.keys(updatedChoresData || {}));
      angular.forEach(updatedChoresData, function (todoData, widgetId) {
        for (var i = 0; i < $scope.groups.length; i++) {
          for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
            var widgerData = $scope.groups[i].widgets[j];

            if (widgerData.type !== "subscriptionError") {
              if (widgerData.widgetSettingId === parseInt(widgetId)) {
                $scope.clearChoresExistingObject(widgerData.widgetSettingId);
                $scope.clearTodoExistingObject(widgerData.widgetSettingId);
                widgerData.data = todoData;

                (function (processedData, currentPage) {
                  $scope.$evalAsync(function () {
                    if (currentPage === $scope.quoteIndex) {
                      $scope.initializeChores(processedData, true);
                    } else {
                      $scope.initializeChores(processedData, false);
                    }
                  });
                })(widgerData, i);

                if (todoData.todos && Object.keys(todoData.todos).length > 0) {
                  $scope.updateChoresExistingWidgetList(
                    widgerData.widgetSettingId,
                    "add"
                  );
                } else {
                  $scope.updateChoresExistingWidgetList(
                    widgerData.widgetSettingId,
                    "remove"
                  );
                }

                break;
              }
            }
          }
        }
      });
    };
  	
   $scope.clearSnapshotExistObject = function (widgetSettingId) {
      for (var i = 0; i < $scope.snapshotList.length; i++) {
        if ($scope.snapshotList[i].widgetId == widgetSettingId) {
        	var object = $scope.snapshotList[i];
        	$interval.cancel(object.snapshotIntervalObject);
        	$scope.snapshotList.splice(i, 1);
        }
      }
    };
    
    $scope.updateBrowserSnapshotData = function(snapshotdata){
    	angular.forEach(snapshotdata, function (browserSnapshotdata, widgetId) {
	        for (var i = 0; i < $scope.groups.length; i++) {
	          for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
	            var widgerData = $scope.groups[i].widgets[j];
	            if (widgerData.type != "subscriptionError") {
	              if (
	                $scope.groups[i].widgets[j].widgetSettingId ==
	                parseInt(widgetId)
	              ) {
	            	  
	            	$scope.clearSnapshotExistObject(parseInt(widgetId));
	                $scope.groups[i].widgets[j].data.browserSnapshotData = browserSnapshotdata;
	                $scope.$apply();
	                $scope.initializeBrowserSnapshotWidget($scope.groups[i].widgets[j],i);
	                continue;
	              }
	            }
	          }
    	    }
    	 });
    }
    
    $scope.clearTodoExistingObject = function (widgetSettingId) {
        for (var i = 0; i < $scope.todoRefreshTimeout.length; i++) {
          if ($scope.todoRefreshTimeout[i].widgetId == widgetSettingId) {
        	  $timeout.cancel($scope.todoRefreshTimeout[i].todoTimeoutObject);
        	  $scope.todoRefreshTimeout.splice(i, 1);
          }
        }
      };
    
    $scope.updateTodoData = function (updatedTodoData) {
      if (window.mmPaintedNotify) window.mmPaintedNotify("socket", "todo", Object.keys(updatedTodoData || {}));
    	angular.forEach(
    			updatedTodoData,
    	        function (todoData, widgetId) {
    				for (var i = 0; i < $scope.groups.length; i++) {
    					for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
    						var widgerData = $scope.groups[i].widgets[j];
    						
    						if (widgerData.type !== "subscriptionError") {
    							if (widgerData.widgetSettingId === parseInt(widgetId)) {
    								$scope.clearTodoExistingObject(widgerData.widgetSettingId);
    								widgerData.data = todoData;
    								
    								(function (processedData, currentPage) {
    									$scope.$evalAsync(function () {
    										if (currentPage === $scope.quoteIndex) {
    											$scope.initializeTodo(processedData, true);
    										} else {
    											$scope.initializeTodo(processedData, false);
    										}
    									});
    								})(widgerData, i);
    								$scope.updateTodoDataInterval(false);
    								break;
    							}
    						}
    					}
    				}
    	        });
    	
//      var isDataFound = false;
//      angular.forEach(updatedTodoData, function (todoData, widgetId) {
//        for (var i = 0; i < $scope.groups.length; i++) {
//          for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
//            var widgerData = $scope.groups[i].widgets[j];
//            if (widgerData.type != "subscriptionError") {
//              if ( $scope.groups[i].widgets[j].widgetSettingId == parseInt(widgetId)) {
//            	$scope.clearTodoExistingObject(widgerData.widgetSettingId);
//            	$scope.groups[i].widgets[j].data = todoData;
//                $scope.$apply();
//                $scope.initializeTodo($scope.groups[i].widgets[j]);
//                continue;
//              }
//            }
//          }
//        }
//      });
      
      
      
      
    };

    $scope.addCalendarTimeout = function (widgetSettingId, timeoutObject) {
      for (var i = 0; i < $scope.fullcalendarObjectList.length; i++) {
        if (
          $scope.fullcalendarObjectList[i].widgetSettingId == widgetSettingId
        ) {
          $scope.fullcalendarObjectList[i].timeout = timeoutObject;
        }
      }
      var cal = { widgetSettingId: widgetSettingId, timeout: timeoutObject };
      $scope.fullcalendarObjectList.push(cal);
    };

    $scope.clearCalendarTimeout = function (widgetSettingId) {
      for (var i = 0; i < $scope.fullcalendarObjectList.length; i++) {
        if (
          $scope.fullcalendarObjectList[i].widgetSettingId == widgetSettingId
        ) {
          $timeout.cancel($scope.fullcalendarObjectList[i].timeout);
          $scope.fullcalendarObjectList.splice(i, 1);
          break;
        }
      }
    };

    // check and remove ical id
    $scope.UpdateIcalId = function (widgetSettingId, isIcal) {
      if (isIcal == true) {
        if (!$scope.icalCalendarWidgetList.includes(widgetSettingId)) {
          $scope.icalCalendarWidgetList.push(widgetSettingId);
          if ($scope.icalCalendarWidgetList.length == 1) {
            if ($scope.icalInterval == undefined) {
              $scope.icalInterval = $interval(function () {
                $scope.updateLatestIcalApi();
              }, 60000);
            }
          }
        }
      } else {
        if ($scope.icalCalendarWidgetList.includes(widgetSettingId)) {
          for (var i = 0; i < $scope.icalCalendarWidgetList.length; i++) {
            if ($scope.icalCalendarWidgetList[i] == widgetSettingId) {
              $scope.icalCalendarWidgetList.splice(i, 1);
              break;
            }
          }
          if ($scope.icalCalendarWidgetList.length == 0) {
            if ($scope.icalInterval != undefined) {
              $interval.cancel($scope.icalInterval);
              $scope.icalInterval = undefined;
            }
          }
        }
      }
    };

    //update etag for existing ical calendars
    $scope.updateIcalEtag = function (updatedCalenderData) {
      if (updatedCalenderData != undefined) {
        for (var i = 0; i < updatedCalenderData.length; i++) {
          for (var j = 0; j < $scope.icalCalendarList.length; j++) {
            if ($scope.icalCalendarList[j].id == updatedCalenderData[i].id) {
              $scope.icalCalendarList[j].etag = updatedCalenderData[i].etag;
              break;
            }
          }
        }
      }
    };

    $scope.updateIcalAccountAndCalendar = function (calData) {
      $scope.icalCalendarList = calData.icalCalendar;
      $scope.icalAccountList = calData.icalAccount;
      $scope.icalCalendarWidgetList = calData.icalWidgetIds;

      if ($scope.icalCalendarWidgetList.length == 0) {
        $interval.cancel($scope.icalInterval);
        $scope.icalInterval = undefined;
        $scope.icalCalendarList = [];
        $scope.icalCalendarWidgetList = [];
      }
    };

    $scope.clearCalendarNextRefreshTimeout = function (widgetId) {
      for (var i = 0; i < $scope.calendarRefreshTimeout.length; i++) {
        if ($scope.calendarRefreshTimeout[i].widgetId == widgetId) {
          $timeout.cancel(
            $scope.calendarRefreshTimeout[i].calendarTimeoutObject
          );
          $scope.calendarRefreshTimeout.splice(i, 1);
          break;
        }
      }
    };

    // calender update code
    $scope.updateCalendarData = function (updatedCalenderData) {
      $scope.calendarCharacterLength = 30;
      $scope.updatedCalenderData = updatedCalenderData;

      var isDataFound = false;
      angular.forEach(updatedCalenderData, function (calData, calkey) {
        $scope.UpdateIcalId(parseInt(calkey), calData.iCal);
        if (calData.isIcalUpdate == true) {
          $scope.updateIcalAccountAndCalendar(calData);
        } else {
          $scope.updateIcalEtag(calData.icalCalendar);
        }

        for (var i = 0; i < $scope.groups.length; i++) {
          for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
            var widgerData = $scope.groups[i].widgets[j];
            if (widgerData.type != "subscriptionError") {
              if (
                $scope.groups[i].widgets[j].widgetSettingId == parseInt(calkey)
              ) {
                if (
                  $scope.currentlyEditWidgetSettingId > 0 &&
                  $scope.currentlyEditWidgetSettingId == parseInt(calkey)
                ) {
                  $rootScope.hideLoadingSpinner(
                    $scope.currentlyEditWidgetSettingId
                  );
                }

                $scope.groups[i].widgets[j].data = calData;
                $scope.$apply();
                var widgetData = $scope.groups[i].widgets[j];
                $scope.clearCalendarTimeout(widgetData.widgetSettingId);
                var calUpdateTimeout = $timeout(function () {
                  $scope.clearCalendarNextRefreshTimeout(
                    widgetData.widgetSettingId
                  );
                  $scope.initializeCalendar(widgetData);
                }, 2000);
                $scope.addCalendarTimeout(
                  $scope.groups[i].widgets[j].widgetSettingId,
                  calUpdateTimeout
                );
                isDataFound = true;
                continue;
              }
            }
          }
          if (isDataFound == true) {
            isDataFound = false;
            continue;
          }
        }
      });
    };

    // notes update code
    $scope.updateNotes = function (updatedNotes) {
      if (window.mmPaintedNotify) window.mmPaintedNotify("socket", "notes", Object.keys(updatedNotes || {}));
      angular.forEach(updatedNotes, function (notesData, widgetId) {
        for (var i = 0; i < $scope.groups.length; i++) {
          for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
            var widgerData = $scope.groups[i].widgets[j];
            if (widgerData.type != "subscriptionError") {
              if (
                $scope.groups[i].widgets[j].widgetSettingId ==
                parseInt(widgetId)
              ) {
                $scope.groups[i].widgets[j].data.parsedNotesdata = notesData;
                $scope.$apply();
                continue;
              }
            }
          }
        }

        $timeout(function () {
          $scope.resizeNotes();
        }, 100);
      });
    };

    // updatemarketwatch
    $scope.updateMarketWatch = function (updatedMarketWatch) {
      if (window.mmPaintedNotify) window.mmPaintedNotify("socket", "marketwatch", Object.keys(updatedMarketWatch || {}));
      angular.forEach(updatedMarketWatch, function (marketWatchData, widgetId) {
        for (var i = 0; i < $scope.groups.length; i++) {
          for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
            var widgerData = $scope.groups[i].widgets[j];
            if (widgerData.type != "subscriptionError") {
              if (
                $scope.groups[i].widgets[j].widgetSettingId ==
                parseInt(widgetId)
              ) {
                $scope.groups[i].widgets[j].data.marketWatchData =
                  marketWatchData;
                $scope.$apply();
                continue;
              }
            }
          }
        }
      });
    };

    // quotes update code
    $scope.updateQuotes = function (updatedQuotes) {
      if (window.mmPaintedNotify) window.mmPaintedNotify("socket", "quotes", Object.keys(updatedQuotes || {}));
      angular.forEach(updatedQuotes, function (quotesData, widgetId) {
        for (var i = 0; i < $scope.groups.length; i++) {
          for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
            var widgerData = $scope.groups[i].widgets[j];
            if (widgerData.type != "subscriptionError") {
              if (
                $scope.groups[i].widgets[j].widgetSettingId ==
                parseInt(widgetId)
              ) {
                $scope.groups[i].widgets[j].data = quotesData;
                $scope.$apply();
                continue;
              }
            }
          }
        }

        $timeout(function () {
          $scope.resizeQuotesFont();
        }, 100);
      });
    };

    // clock update code
    $scope.updateMappedClockSetting = function (
      widgetSettingId,
      updatedClockData
    ) {
      for (var i = 0; i < $scope.clockWidgetList.length; i++) {
        if ($scope.clockWidgetList[i].widgetId == widgetSettingId) {
          clockWidget = $scope.clockWidgetList[i];
          if (clockWidget.intervalObject != null) {
            $interval.cancel(clockWidget.intervalObject);
          }
          clockWidget.intervalObject = $scope.updateClockInterval(
            clockWidget.widgetSetting
          );
          $scope.clockWidgetList[i] = clockWidget;
        }
      }
    };

    $scope.updateClock = function (updatedClockData) {
      if (window.mmPaintedNotify) window.mmPaintedNotify("socket", "clock-setting", Object.keys(updatedClockData || {}));
      $scope.updatedClockData = updatedClockData;
      angular.forEach(updatedClockData, function (clockData, widgetId) {
        for (var i = 0; i < $scope.groups.length; i++) {
          for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
            var widgerData = $scope.groups[i].widgets[j];
            if (widgerData.type != "subscriptionError") {
              if (
                $scope.groups[i].widgets[j].widgetSettingId ==
                parseInt(widgetId)
              ) {
                clockData.dummyClockData = $scope.getClockDummyData(clockData);
                $scope.updateMappedClockSetting(parseInt(widgetId), clockData);
                $scope.groups[i].widgets[j].data = clockData;
                $scope.showClock($scope.groups[i].widgets[j]);
                $scope.$apply();
                continue;
              }
            }
          }
        }

        $timeout(function () {
          $scope.clockFontResize();
        }, 100);
      });
    };

    var opacityArray = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0];
    $scope.loadMirrorBgSettings = function () {
      var mirrorBgData = mirrorBackgroundSettings;
      loadMirrorPageThemeCss(mirrorBgData);
    };

    function loadMirrorPageThemeCss(mirrorData) {
      var themeLink = document.getElementById("theme-link");
      var oldlink = document.getElementById("theme-link");
      head = document.getElementsByTagName("head")[0];
      themeLink = document.createElement("link");
      themeLink.setAttribute("id", "theme-link");

      themeLink.type = "text/css";
      themeLink.rel = "stylesheet";
      $scope.bodyElement = window.document.getElementById("main");
      $scope.themeName = mirrorData.theme;
      $scope.bodyElement.style.color = "";
      if (mirrorData.theme === "Cyborg") {
        themeLink.href = "assets/themeCSS/cyborg-bootstrap.min.css";
        $scope.bodyElement.style.color = "white";
      } else if (mirrorData.theme === "Simplex") {
        themeLink.href = "assets/themeCSS/simplex-bootstrap.min.css";
      } else if (mirrorData.theme === "Lux") {
        themeLink.href = "assets/themeCSS/lux-bootstrap.min.css";
      } else if (mirrorData.theme === "Sketchy") {
        themeLink.href = "assets/themeCSS/sketchy-bootstrap.min.css";
      } else if (mirrorData.theme === "Slate") {
        themeLink.href = "assets/themeCSS/slate-bootstrap.min.css";
      }
      head.replaceChild(themeLink, oldlink);

      var element = document.getElementById("main");
      element.style.setProperty("color", mirrorData.fontColor);
      element.style.setProperty("font-family", mirrorData.fontFamily);
      element.style.setProperty(
        "background-color",
        mirrorData.pageBackgroundColor
      );
    }

    function hexToRgbA(hex, transparency) {
      var c;
      if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        c = hex.substring(1).split("");
        if (c.length == 3) {
          c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c = "0x" + c.join("");
        return (
          "rgba(" +
          [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(",") +
          "," +
          (10 - transparency) * 0.1 +
          ")"
        );
      }
      throw new Error("Bad Hex");
    }
    
    $scope.getBackgroundFormatType = function (widgetData) {
        return String(
          (widgetData &&
            widgetData.widgetBackgroundSettingModel &&
            widgetData.widgetBackgroundSettingModel.backgroundFormatType) ||
            ""
        )
          .trim()
          .toLowerCase();
      };

    var widgetTitleStyleCache = {};
    $scope.getWidgetTitleStyle = function (widgetData) {
      var widgetBackgroundSettingModel =
        widgetData && widgetData.widgetBackgroundSettingModel;
      if (!widgetBackgroundSettingModel) {
        return {};
      }

      var cacheKey =
        (widgetBackgroundSettingModel.widgetTitleFormat || "") +
        "|" +
        (widgetBackgroundSettingModel.corner || "");
      if (widgetTitleStyleCache[cacheKey]) {
        return widgetTitleStyleCache[cacheKey];
      }

      var titleFormatObject = {};
      try {
        titleFormatObject = JSON.parse(
          widgetBackgroundSettingModel.widgetTitleFormat || "{}"
        );
      } catch (e) {
        titleFormatObject = {};
      }

      var titleStyle = {};
      if (titleFormatObject.fontFamily) {
        titleStyle.fontFamily = titleFormatObject.fontFamily;
      }
      if (titleFormatObject.fontColor) {
        titleStyle.color = titleFormatObject.fontColor;
      }
      if (titleFormatObject.backgroundColor) {
        titleStyle.backgroundColor = titleFormatObject.backgroundColor;
      }
      if (titleFormatObject.alignment) {
        titleStyle.textAlign = titleFormatObject.alignment;
      }
      if (titleFormatObject.fontSize !== undefined && titleFormatObject.fontSize !== null) {
        titleStyle.fontSize = titleFormatObject.fontSize + "px";
      }

      titleStyle.borderTopRightRadius =
        widgetBackgroundSettingModel.corner === "rounded" ? "15px" : "0px";
      titleStyle.borderTopLeftRadius =
        widgetBackgroundSettingModel.corner === "rounded" ? "15px" : "0px";

      widgetTitleStyleCache[cacheKey] = titleStyle;

      return titleStyle;
    };

    $scope.loadPageData = function (mirrorBgData, index) {
      $scope.pageData1 = mirrorBgData;
      var backgroundFormatType = $scope.getBackgroundFormatType(mirrorBgData);
      
      var widgetSettingInterval = setInterval(function () {
        var widgetDiv = window.document.getElementById(
          mirrorBgData.widgetSettingId + "_" + index
        );
        if (
          widgetDiv &&
          mirrorBgData &&
          mirrorBgData.widgetBackgroundSettingModel
        ) {
          // A targeted refresh reuses the existing DOM element. Clear the
          // previously applied format first so custom/default/preset changes
          // render the same way as they do after a full page load.
          widgetDiv.style.backgroundColor = "";
          widgetDiv.style.webkitBackdropFilter = "";
          widgetDiv.style.backdropFilter = "";
          widgetDiv.style.boxShadow = "none";
          widgetDiv.style.borderRadius = "0px";
          widgetDiv.style.overflow = "";
          widgetDiv.style.fontFamily = "";
          widgetDiv.style.color = "";

          if (backgroundFormatType === "preset") {
            widgetDiv.style.backgroundColor = "transparent";
            widgetDiv.style.overflow = "visible";
            widgetDiv.style.zIndex = String(
              997 - (Number(mirrorBgData.zindex) || 0)
            );
          } else if (mirrorBgData.widgetBackgroundSettingModel.blur > 0) {
            if (
              mirrorBgData.widgetBackgroundSettingModel.backgroundColor !=
              "default"
            ) {
              var color = hexToRgbA(
                mirrorBgData.widgetBackgroundSettingModel.backgroundColor,
                5
              );
              widgetDiv.style.backgroundColor = color;
              widgetDiv.style.webkitBackdropFilter =
                "blur(" +
                mirrorBgData.widgetBackgroundSettingModel.blur / 10 +
                "px)" +
                " opacity(" +
                opacityArray[
                  mirrorBgData.widgetBackgroundSettingModel.transparency
                ] +
                ")";
              widgetDiv.style.backdropFilter =
                "blur(" +
                mirrorBgData.widgetBackgroundSettingModel.blur / 10 +
                "px)" +
                " opacity(" +
                opacityArray[
                  mirrorBgData.widgetBackgroundSettingModel.transparency
                ] +
                ")";
            }
          } else if (
            mirrorBgData.widgetBackgroundSettingModel.transparency > 0
          ) {
            if (
              mirrorBgData.widgetBackgroundSettingModel.backgroundColor !=
              "default"
            ) {
              var color = hexToRgbA(
                mirrorBgData.widgetBackgroundSettingModel.backgroundColor,
                mirrorBgData.widgetBackgroundSettingModel.transparency
              );
              widgetDiv.style.backgroundColor = color;
              if (mirrorBgData.widgetBackgroundSettingModel.blur > 0) {
                widgetDiv.style.webkitBackdropFilter =
                  "opacity(" +
                  opacityArray[
                    mirrorBgData.widgetBackgroundSettingModel.transparency
                  ] +
                  ")";
                widgetDiv.style.backdropFilter =
                  "opacity(" +
                  opacityArray[
                    mirrorBgData.widgetBackgroundSettingModel.transparency
                  ] +
                  ")";
              }
            }
          } else {
            widgetDiv.style.backgroundColor =
              mirrorBgData.widgetBackgroundSettingModel.backgroundColor;
          }
          if (
            mirrorBgData.widgetBackgroundSettingModel.fontFamily &&
            mirrorBgData.widgetBackgroundSettingModel.fontFamily != "default"
          ) {
            widgetDiv.style.fontFamily =
              mirrorBgData.widgetBackgroundSettingModel.fontFamily;
          }
          if (
            mirrorBgData.widgetBackgroundSettingModel.fontColor &&
            mirrorBgData.widgetBackgroundSettingModel.fontColor != "default"
          ) {
            widgetDiv.style.color =
              mirrorBgData.widgetBackgroundSettingModel.fontColor;
          }

          if (backgroundFormatType !== "preset") {
            widgetDiv.style.boxShadow = mirrorBgData.widgetBackgroundSettingModel
              .shadow
              ? "0px 2px 4px rgba(0, 0, 0, 0.14), 0px 3px 4px rgba(0, 0, 0, 0.12), 0px 1px 5px rgba(0, 0, 0, 0.2)"
              : "none";
            widgetDiv.style.borderRadius =
              mirrorBgData.widgetBackgroundSettingModel.corner === "rounded"
                ? "15px"
                : "0px";
            if (
              mirrorBgData.contentType ==
                MANGO_MIRROR_CONSTANT.WIDGET_TYPE_IMAGE &&
              mirrorBgData.widgetBackgroundSettingModel.corner === "rounded"
            ) {
              widgetDiv.style.overflow = "hidden";
            }
          }

          var widgetTitle = window.document.getElementById(
            "widgetname_" + mirrorBgData.widgetSettingId + "_" + index
          );
          if (widgetTitle != null) {
            widgetTitle.classList.add("plr5");
            var widgetTitleStyle = $scope.getWidgetTitleStyle(mirrorBgData);
            for (var titleStyleKey in widgetTitleStyle) {
              if (widgetTitleStyle.hasOwnProperty(titleStyleKey)) {
                widgetTitle.style[titleStyleKey] = widgetTitleStyle[titleStyleKey];
              }
            }
          }
          clearInterval(widgetSettingInterval);
        }
      }, 500);
    };

    // initialize web panel body before load

    $scope.loadBody = function () {
      var heightValue = isNaN(Number($scope.bodyHeight))
        ? $scope.bodyHeight
        : Number($scope.bodyHeight) + "px";
      var widthValue = isNaN(Number($scope.bodyWidth))
        ? $scope.bodyWidth
        : Number($scope.bodyWidth) + "px";

      var mainElement = document.getElementById("main");
      if (mainElement) {
        mainElement.style.height = heightValue;
        mainElement.style.width = widthValue;
        mainElement.style.maxHeight = heightValue;
        mainElement.style.maxWidth = widthValue;
      }

      var bgImg1 = document.getElementById("bg_img_1");
      if (bgImg1) {
        bgImg1.style.height = heightValue;
        bgImg1.style.width = widthValue;
      }

      var bgImg2 = document.getElementById("bg_img_2");
      if (bgImg2) {
        bgImg2.style.height = heightValue;
        bgImg2.style.width = widthValue;
      }

      $scope.updatePreviewScrollState();
    };

    // get min height/width of individual widget

    $scope.getMinHeight = function (id) {
      $scope.height = 0;
      angular.forEach($scope.groups, function (group) {
        angular.forEach(group.widgets, function (value, key) {
          if (id == value.widgetSettingId) {
            $scope.height = value.minHeight;
          }
        });
      });
      return $scope.height;
    };

    $scope.getMinWidth = function (id) {
      $scope.width = 0;
      angular.forEach($scope.groups, function (group) {
        angular.forEach(group.widgets, function (value, key) {
          if (id == value.widgetSettingId) {
            $scope.width = value.minWidth;
          }
        });
      });
      return $scope.width;
    };

    /* resize stickynotes and quotes widget */

    $scope.automaticallyResizeContent = [];
    $scope.stickyNotesId = [];
    $scope.countDownWidgetId = [];

    $scope.isNewsResizeInitialize = false;

    $scope.getObjectSize = function (obj) {
      return Object.keys(obj).length;
    };

    $scope.autoResizeByPageNumber = function (index) {
      var pageIndex = index;
      $scope.automaticallyResizeContent = [];
      angular.forEach($scope.groups[pageIndex].widgets, function (value, key) {
        if (
          value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_STICKYNOTES ||
          value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_QUOTES ||
          value.widgetMasterCategory ==MANGO_MIRROR_CONSTANT.WIDGET_TYPE_NEWS ||
          value.widgetMasterCategory == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_IFRAMILY ||
          value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_WEATHER ||
          value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CLOCK ||
          value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CALENDAR ||
          value.graphType == MANGO_MIRROR_CONSTANT.BAR_GRAPH_TYPE ||
          value.graphType == MANGO_MIRROR_CONSTANT.LINE_GRAPH_TYPE ||
          value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_TODO ||
          value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_COUNTDOWN ||
          value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CHORES ||
          value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_BROWSER_SNAPSHOT ||
          value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_POWER_BI ||
          (value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_MEALPLAN &&
            value.status == "on")
        ) {
          $scope.automaticallyResizeContent.push(value);
        }
      });

      if ($scope.automaticallyResizeContent.length > 0) {
        $scope.graphId = [];
        angular.forEach(
          $scope.automaticallyResizeContent,
          function (value, key) {
            if (value.status == "on") {
              if (value.contentType.toLowerCase() == "stickynotes") {
                $timeout(function () {
                  $scope.resizeNotes();
                }, 50);
              } else if (
                value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_WEATHER
              ) {
                $timeout(function () {
                  $scope.resizeWeatherFont();
                }, 50);
              } else if (value.contentType.toLowerCase() == "quotes") {
                $timeout(function () {
                  $scope.resizeQuotesFont();
                }, 50);
              } else if (value.contentType.toLowerCase() == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_BROWSER_SNAPSHOT) 
              {
            	  $scope.initializeBrowserSnapshotWidget(value,pageIndex);
              } else if (
                value.widgetMasterCategory ==
                MANGO_MIRROR_CONSTANT.WIDGET_TYPE_NEWS
              ) {
                $timeout(function () {
                  $scope.resizeNewsFont();
                }, 50);
              } else if (
                value.graphType == MANGO_MIRROR_CONSTANT.BAR_GRAPH_TYPE ||
                value.graphType == MANGO_MIRROR_CONSTANT.LINE_GRAPH_TYPE
              ) {
                if (value.data.type != "subscriptionError") {
                  $scope.graphId.push("graph_" + value.widgetSettingId);
                  $scope.graphResize();
                }
              } else if (
                value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CLOCK
              ) {
                $timeout(function () {
                  $scope.clockFontResize();
                }, 50);
              } else if (
                value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CALENDAR
              ) {
                $timeout(function () {
                  $scope.initializeCalendar(value);
                }, 200);
              } else if (
                value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_POWER_BI
              ) {
                $timeout(function () {
                  $scope.checkAndRenderPowerBi(value);
                }, 200);
              } else if (
                value.widgetMasterCategory == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_IFRAMILY
              ) {
                $timeout(function () {
                  $scope.checkAndRenderIframly();
                }, 200);
              } else if (
                value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_TODO
              ) {
                $timeout(function () {
                  $scope.initializeTodo(value, true);
                }, 200);
              } else if (
                value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_COUNTDOWN
              ) {
                $scope.countDownWidgetId.push(value.widgetSettingId);
                $timeout(function () {
                  $scope.initializeCountDown(value);
                }, 200);
              } else if (
                value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CHORES
              ) {
                $timeout(function () {
                  $scope.initializeChores(value, true);
                }, 200);
              } else if (
                value.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_MEALPLAN
              ) {
                $timeout(function () {
                  $scope.initializeCalendar(value);
                }, 200);
              }
            }
          }
        );
      }
    };

    $scope.mapNotesWidgetData = function (widgetData, index, widgetIndex) {
      var noteWidget = {
        widgetId: widgetData.widgetSettingId,
        widgetSetting: widgetData,
        pagenumber: [index],
        widgetIndexKey: [{ pagenumber: index, widgetIndexNumber: widgetIndex }],
      };

      var isDataFound = false;
      angular.forEach($scope.stickyNotesId, function (data) {
        if (data.widgetId == widgetData.widgetSettingId) {
          isDataFound = true;
          data.pagenumber.push(index);
        }
      });
      if (isDataFound == false) {
        if (widgetData.data != null) {
          $scope.stickyNotesId.push(noteWidget);
        }
      }
    };

    $scope.initNotesWidget = function (widgetData, index, innerIndex) {
      $scope.mapNotesWidgetData(widgetData, index, innerIndex);
      $scope.resizeNotes();
    };

    $scope.resizeNotes = function () {
      try {
        angular.forEach($scope.stickyNotesId, function (value, key) {
          if (value.pagenumber.includes($scope.quoteIndex)) {
            var id = "stickyNotes_" + value.widgetId + "_" + $scope.quoteIndex;
            var elementId = document.getElementById(id);
            if (elementId == null) {
              $timeout($scope.resizeNotes, 200);
              return;
            } else {
              var titleFormatObject = JSON.parse(
                value.widgetSetting.widgetBackgroundSettingModel
                  .widgetTitleFormat
              );
              var widgetBackgroundSettingModel =
                value.widgetSetting.widgetBackgroundSettingModel;
              var renderHeight =
                Number(value.widgetSetting.renderHeight) ||
                value.widgetSetting.height;
              var renderWidth =
                Number(value.widgetSetting.renderWidth) ||
                value.widgetSetting.width;

              if (
                widgetBackgroundSettingModel &&
                String(
                  widgetBackgroundSettingModel.backgroundFormatType || ""
                )
                  .trim()
                  .toLowerCase() == "preset"
              ) {
                var notesInnerHeight =
                  renderHeight;
                var notesInnerWidth = renderWidth;

                if (widgetBackgroundSettingModel.isNameVisible == true) {
                  notesInnerHeight =
                    notesInnerHeight - titleFormatObject.fontSize * 1.5;
                }

                elementId.style.height = Math.max(0, notesInnerHeight) + "px";
                elementId.style.width = Math.max(0, notesInnerWidth) + "px";
              } else if (widgetBackgroundSettingModel.isNameVisible == false) {
                elementId.style.height = value.widgetSetting.height + "px";
                elementId.style.width = "";
              } else {
                elementId.style.height =
                  value.widgetSetting.height -
                  titleFormatObject.fontSize * 1.5 +
                  "px";
                elementId.style.width = "";
              }

              if (
                value.widgetSetting.widgetBackgroundSettingModel.autofit == true
              ) {
                var data = $("#" + id).text();
                if (data.length < 1) {
                  $timeout($scope.resizeNotes, 200);
                  return;
                } else {
                  $("#" + id).textfill({ maxFontPixels: 300 });
                }
              }
            }
          }
        });
      } catch (e) {
        console.log("Something went wrong while resizing stickynotes");
      }
    };

    $scope.graphResize = function () {
      try {
        if ($scope.graphId.length > 0) {
          var elemetId = document.getElementById(
            $scope.graphId[0] + "_" + $scope.quoteIndex
          );
          if (elemetId == null) {
            $timeout($scope.graphResize, 200);
            return;
          } else {
            angular.forEach($scope.graphId, function (value, key) {
              var id = value + "_" + $scope.quoteIndex;
              var healthSource = value + "_" + $scope.quoteIndex + "_source";
              var lastUpdatedDate =
                value + "_" + $scope.quoteIndex + "_updatedAt";
              var elemetId = document.getElementById(id);
              if (elemetId == null) {
                $timeout($scope.graphResize, 200);
                return;
              } else {
                var data = $("#" + id).text();
                if (data.length < 1) {
                  $timeout($scope.graphResize, 200);
                  return;
                } else {
                  $("#" + id).textfill({ maxFontPixels: 300 });
                  $("#" + healthSource).textfill({ maxFontPixels: 200 });
                  // $('#' +
                  // lastUpdatedDate).textfill({maxFontPixels
                  // : 200});
                }
              }
            });
          }
        }
      } catch (e) {
        console.log("Something went wrong while resizing graph widget");
      }
    };

    $scope.resizeNewsFont = function () {
      try {
        for (var i = 0; i < $scope.newsWidgetList.length; i++) {
          if ($scope.newsWidgetList[i].pagenumber.includes($scope.quoteIndex)) {
            var widgetData = $scope.newsWidgetList[i].widgetSetting;
            var titleFormatObject = JSON.parse(
              widgetData.widgetBackgroundSettingModel.widgetTitleFormat
            );
            var widgetFormatObject = JSON.parse(
              widgetData.widgetBackgroundSettingModel.widgetFormat
            );
            var renderWidth = Number(widgetData.renderWidth) || widgetData.width;
            var renderHeight = Number(widgetData.renderHeight) || widgetData.height;

            var elemetId = document.getElementById(
              "newsdata_" + widgetData.widgetSettingId + "_" + $scope.quoteIndex
            );
            if (elemetId == null) {
              $timeout($scope.resizeNewsFont, 200);
              return;
            } else {
              var newsSourceElementId =
                "newsSource_" +
                widgetData.widgetSettingId +
                "_" +
                $scope.quoteIndex;
              var newsSourceElement =
                document.getElementById(newsSourceElementId);
              newsSourceElement.style.fontFamily =
                widgetFormatObject.ns.fontFamily;
              newsSourceElement.style.color = widgetFormatObject.ns.fontColor;
              newsSourceElement.style.textAlign =
                widgetFormatObject.ns.alignment;
              newsSourceElement.style.fontSize =
                widgetFormatObject.ns.fontSize + "px";
              newsSourceElement.style.width = renderWidth + "px";

              var newsHeadlineheight =
                renderHeight - widgetFormatObject.ns.fontSize * 1.5 - 20;
              elemetId.style.height = newsHeadlineheight + "px";
              elemetId.style.width = renderWidth + "px";
              elemetId.style.fontFamily =
                widgetFormatObject.headline.fontFamily;
              elemetId.style.color = widgetFormatObject.headline.fontColor;
              elemetId.style.textAlign = widgetFormatObject.headline.alignment;

              if (widgetData.widgetBackgroundSettingModel.autofit == false) {
                elemetId.style.fontSize =
                  widgetFormatObject.headline.fontSize + "px";
              } else {
                var dataId = "news_" + widgetData.widgetSettingId + "_data";
                var data = $("#" + dataId).text();
                if (data.trim().length < 1) {
                  $timeout($scope.resizeNewsFont, 200);
                  return;
                } else {
                  if (data.trim() != "News Data will be load soon..") {
                    var id =
                      "newsdata_" +
                      widgetData.widgetSettingId +
                      "_" +
                      $scope.quoteIndex;
                    $("#" + id).textfill({ maxFontPixels: 300 });
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.log("Something went wrong while resizing news widget");
      }
    };

    $scope.StickynotesFont = function (id) {
      $("#" + id).textfill({
        maxFontPixels: 300,
      });
    };

    $scope.resizeQuotesFont = function () {
      try {
        for (var i = 0; i < $scope.quoteWidgetList.length; i++) {
          if (
            $scope.quoteWidgetList[i].pagenumber.includes($scope.quoteIndex)
          ) {
            var widgetData = $scope.quoteWidgetList[i].widgetSetting;
            var titleFormatObject = JSON.parse(
              widgetData.widgetBackgroundSettingModel.widgetTitleFormat
            );
            var renderHeight = Number(widgetData.renderHeight) || widgetData.height;
            var renderWidth = Number(widgetData.renderWidth) || widgetData.width;
            var bodyElementId =
              widgetData.contentType.toLowerCase() +
              "_" +
              widgetData.widgetSettingId +
              "_" +
              $scope.quoteIndex;
            var widgetBody = window.document.getElementById(bodyElementId);

            if (widgetBody != null) {
              widgetBody.style.width = renderWidth + "px";
              var quotesInnerHeight = renderHeight;
              if (
                widgetData.widgetBackgroundSettingModel.isNameVisible == true
              ) {
                quotesInnerHeight =
                  quotesInnerHeight - titleFormatObject.fontSize * 1.5;
              }
              widgetBody.style.height = Math.max(0, quotesInnerHeight) + "px";
            } else {
              $timeout(function () {
                $scope.resizeQuotesFont();
              }, 200);
              return;
            }

            var id =
              "quotes_" + widgetData.widgetSettingId + "_" + $scope.quoteIndex;
            var quotesSaidId =
              "quotesSaid_" +
              widgetData.widgetSettingId +
              "_" +
              $scope.quoteIndex;
            var elemetId = document.getElementById(id);

            var widgetFormatObject = JSON.parse(
              widgetData.widgetBackgroundSettingModel.widgetFormat
            );
            var authorElementId =
              "quotesAuthor_" +
              widgetData.widgetSettingId +
              "_" +
              $scope.quoteIndex;
            var authorElement = document.getElementById(authorElementId);
            if (elemetId == null) {
              $timeout(function () {
                $scope.resizeQuotesFont();
              }, 200);
              return;
            } else {
              elemetId.style.fontFamily = widgetFormatObject.quote.fontFamily;
              elemetId.style.color = widgetFormatObject.quote.fontColor;
              elemetId.style.textAlign = widgetFormatObject.quote.alignment;

              if (authorElement != null) {
                authorElement.style.fontFamily =
                  widgetFormatObject.author.fontFamily;
                authorElement.style.color = widgetFormatObject.author.fontColor;
                authorElement.style.textAlign =
                  widgetFormatObject.author.alignment;
              }

              if (widgetData.widgetBackgroundSettingModel.autofit == false) {
                elemetId.style.fontSize =
                  widgetFormatObject.quote.fontSize + "px";
                if (authorElement != null) {
                  authorElement.style.fontSize =
                    widgetFormatObject.author.fontSize + "px";
                }
              } else {
                if (elemetId == null) {
                  $timeout(function () {
                    $scope.resizeQuotesFont();
                  }, 200);
                  return;
                } else {
                  var data = $("#" + quotesSaidId).text();
                  if (data.length < 1) {
                    $timeout(function () {
                      $scope.resizeQuotesFont();
                    }, 200);
                    return;
                  } else {
                    $("#" + id).textfill({
                      maxFontPixels: 300,
                    });
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.log("Something went wrong while resizing quotes widget");
      }
    };

    $scope.clockFontResize = function () {
      try {
        for (var i = 0; i < $scope.clockWidgetList.length; i++) {
          if (
            $scope.clockWidgetList[i].pagenumber.includes($scope.quoteIndex)
          ) {
            var widgetData = $scope.clockWidgetList[i].widgetSetting;
            var renderHeight = Number(widgetData.renderHeight) || widgetData.height;
            var timeId =
              "time_" + widgetData.widgetSettingId + "_" + $scope.quoteIndex;
            var dummyTimeId =
              "dummyTime_" +
              widgetData.widgetSettingId +
              "_" +
              $scope.quoteIndex;
            var dummyTimeElementId = document.getElementById(dummyTimeId);
            var clockGreetingId =
              "clockGreeting_" +
              widgetData.widgetSettingId +
              "_" +
              $scope.quoteIndex;
            var clockDateId =
              "clockDate_" +
              widgetData.widgetSettingId +
              "_" +
              $scope.quoteIndex;
            var clockWidgetNameId =
              "widgetname_" +
              widgetData.widgetSettingId +
              "_" +
              $scope.quoteIndex;
            var elementId = document.getElementById(timeId);

            var greetingElement = document.getElementById(clockGreetingId);
            var clockDateElement = document.getElementById(clockDateId);
            if (
              elementId == null &&
              greetingElement == null &&
              clockDateElement == null
            ) {
              $timeout(function () {
                $scope.clockFontResize();
              }, 200);
              return;
            } else {
              var data = "";
              if (widgetData.data.isTimeEnabled == true) {
                data = $("#" + timeId).text();
              }

              if (widgetData.data.clockMessageStatus == true) {
                data = $("#" + clockGreetingId).text();
              }
              if (widgetData.data.isDateEnabled == true) {
                data = $("#" + clockDateId).text();
              }

              if (data.length < 1) {
                $timeout(function () {
                  $scope.clockFontResize();
                }, 200);
                return;
              } else {
                var widgetFormat = JSON.parse(
                  widgetData.widgetBackgroundSettingModel.widgetFormat
                );
                var titleFormat = JSON.parse(
                  widgetData.widgetBackgroundSettingModel.widgetTitleFormat
                );

                var clockParentId =
                  "clock_" +
                  widgetData.widgetSettingId +
                  "_" +
                  $scope.quoteIndex;
                var clockParentElement = document.getElementById(clockParentId);
                var bodyHeight = renderHeight;
                if (widgetData.widgetBackgroundSettingModel.isNameVisible) {
                  bodyHeight = bodyHeight - titleFormat.fontSize * 1.5;
                  clockParentElement.style.height = bodyHeight + "px";
                } else {
                  clockParentElement.style.height = bodyHeight + "px";
                }

                if (greetingElement != null) {
                  greetingElement.style.color = widgetFormat.greeting.fontColor;
                  greetingElement.style.fontFamily =
                    widgetFormat.greeting.fontFamily;
                  greetingElement.style.textAlign =
                    widgetFormat.greeting.alignment;
                  greetingElement.style.height = bodyHeight * 0.18 + "px";
                  greetingElement.style.lineHeight = bodyHeight * 0.18 + "px";
                }

                if (elementId != null) {
                  elementId.style.color = widgetFormat.time.fontColor;
                  elementId.style.fontFamily = widgetFormat.time.fontFamily;
                  elementId.style.textAlign = widgetFormat.time.alignment;
                  elementId.style.height = bodyHeight * 0.6 + "px";
                  elementId.style.lineHeight = bodyHeight * 0.6 + "px";
                }

                if (dummyTimeElementId != null) {
                  dummyTimeElementId.style.color = widgetFormat.time.fontColor;
                  dummyTimeElementId.style.fontFamily =
                    widgetFormat.time.fontFamily;
                  dummyTimeElementId.style.textAlign =
                    widgetFormat.time.alignment;
                  dummyTimeElementId.style.height = bodyHeight * 0.6 + "px";
                  dummyTimeElementId.style.lineHeight = bodyHeight * 0.6 + "px";
                }

                if (clockDateElement != null) {
                  clockDateElement.style.color = widgetFormat.date.fontColor;
                  clockDateElement.style.fontFamily =
                    widgetFormat.date.fontFamily;
                  clockDateElement.style.textAlign =
                    widgetFormat.date.alignment;
                  clockDateElement.style.height = bodyHeight * 0.18 + "px";
                  clockDateElement.style.lineHeight = bodyHeight * 0.18 + "px";
                }

                if (widgetData.widgetBackgroundSettingModel.autofit == false) {
                  elementId.style.fontSize = widgetFormat.time.fontSize + "px";
                  if (greetingElement != null) {
                    greetingElement.style.fontSize =
                      widgetFormat.greeting.fontSize + "px";
                  }
                  clockDateElement.style.fontSize =
                    widgetFormat.date.fontSize + "px";
                } else {
                  if (widgetData.data.isTimeEnabled == true) {
                    $("#" + dummyTimeId).textfill({
                      maxFontPixels: 300,
                    });

                    (function (elementId, dummyTimeElementId) {
                      $scope.$evalAsync(function () {
                        elementId.children[0].style.fontSize =
                          dummyTimeElementId.children[0].style.fontSize;
                      });
                    })(elementId, dummyTimeElementId);
                  }

                  if (widgetData.data.clockMessageStatus == true) {
                    $("#" + clockGreetingId).textfill({
                      maxFontPixels: 300,
                    });
                  }
                  if (widgetData.data.isDateEnabled == true) {
                    $("#" + clockDateId).textfill({
                      maxFontPixels: 300,
                    });
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.log("Something went wrong while resizing clock widget");
      }
    };

    $scope.resizeWeatherFont = function () {
      try {
        for (var i = 0; i < $scope.weatherWidgetList.length; i++) {
          if (
            $scope.weatherWidgetList[i].pagenumber.includes($scope.quoteIndex)
          ) {
            var widgetData = $scope.weatherWidgetList[i].widgetSetting;
            var isVerticalLayout = false;

            if (
              widgetData.data.orientation != undefined &&
              widgetData.data.orientation === "Vertical"
            ) {
              isVerticalLayout = true;
            }

            var widgetFormat = JSON.parse(
              widgetData.widgetBackgroundSettingModel.widgetFormat
            );
            var titleFormat = JSON.parse(
              widgetData.widgetBackgroundSettingModel.widgetTitleFormat
            );

            var elementWidth = Number(widgetData.renderWidth) || widgetData.width;
            var elementHeight = Number(widgetData.renderHeight) || widgetData.height;
            if (widgetData.widgetBackgroundSettingModel.isNameVisible) {
              elementHeight = elementHeight - titleFormat.fontSize * 1.5;
            }
            var weatherWidgetName =
              "widgetname_" +
              widgetData.widgetSettingId +
              "_" +
              $scope.quoteIndex;
            var weatherElementId =
              "weather_" + widgetData.widgetSettingId + "_" + $scope.quoteIndex;
            var weatherElement = document.getElementById(weatherElementId);
            if (weatherElement == null) {
              $timeout(function () {
                $scope.resizeWeatherFont();
              }, 300);
              return;
            }
            weatherElement.style.height = elementHeight + "px";

            if (widgetData.data.weather_type == "Today's Weather") {
              var commonId =
                widgetData.widgetSettingId + "_" + $scope.quoteIndex;
              var descId = "desc_" + commonId;
              var weatherDataId = "weatherdata_" + commonId;
              var hlId = "hl_" + commonId;
              var parentImageId = "iconParent_" + commonId;
              var weatherIconId = "icon_" + commonId;

              var descElement = document.getElementById(descId);

              if (descElement == null) {
                $timeout($scope.resizeWeatherFont, 500);
                return;
              } else {
                descElement.style.height =
                  Math.ceil(elementHeight * 0.25) + "px";
                descElement.style.textAlign = widgetFormat.label.alignment;
                descElement.style.justifyContent = widgetFormat.label.alignment;
                descElement.style.fontFamily = widgetFormat.label.fontFamily;
                descElement.style.color = widgetFormat.label.fontColor;

                var imageElement = document.getElementById(parentImageId);
                imageElement.style.justifyContent = widgetFormat.icon.alignment;
                imageElement.style.alignItems = widgetFormat.icon.alignment;

                var weatherIconElement = document.getElementById(weatherIconId);
                if (imageElement.offsetWidth < imageElement.offsetHeight) {
                  weatherIconElement.style.height = imageElement.offsetWidth;
                } else {
                  weatherIconElement.style.height = imageElement.offsetHeight;
                }

                var hlElement = document.getElementById(hlId);
                hlElement.style.height = Math.ceil(elementHeight * 0.25) + "px";
                hlElement.style.justifyContent = widgetFormat.hl.alignment;
                hlElement.style.fontFamily = widgetFormat.hl.fontFamily;
                hlElement.style.color = widgetFormat.hl.fontColor;

                var weatherDataElement = document.getElementById(weatherDataId);
                weatherDataElement.style.height =
                  Math.ceil(elementHeight * 0.5) + "px";
                weatherDataElement.style.textAlign =
                  widgetFormat.value.alignment;
                weatherDataElement.style.fontFamily =
                  widgetFormat.value.fontFamily;
                weatherDataElement.style.color = widgetFormat.value.fontColor;

                var weatherTextElement = document.getElementById(
                  "temptext_" + commonId
                );
                weatherTextElement.style.height =
                  Math.ceil(elementHeight * 0.5) + "px";
                weatherTextElement.style.textAlign =
                  widgetFormat.value.alignment;

                var data = $("#" + descId).text();
                if (data.length < 1) {
                  $timeout($scope.resizeWeatherFont, 500);
                  return;
                } else {
                  var _highTempLabel = document.getElementById(
                    "highTempLabel_" + commonId
                  );
                  var _lowTempLabel = document.getElementById(
                    "lowTempLabel_" + commonId
                  );
                  var _highTempValue = document.getElementById(
                    "highTempValue_" + commonId
                  );
                  var _lowTempValue = document.getElementById(
                    "lowTempValue_" + commonId
                  );

                  if (widgetData.widgetBackgroundSettingModel.autofit == true) {
                    $("#" + descId).textfill({ maxFontPixels: 300 });
                    $("#" + "temptext_" + commonId).textfill({
                      maxFontPixels: 300,
                    });

                    var temperatureHighLow =
                      elementHeight < elementWidth
                        ? elementHeight * 0.1
                        : elementWidth * 0.1;
                    _highTempLabel.style.fontSize = temperatureHighLow;
                    _lowTempLabel.style.fontSize = temperatureHighLow;
                    _highTempValue.style.fontSize = temperatureHighLow;
                    _lowTempValue.style.fontSize = temperatureHighLow;
                  } else {
                    descElement.style.fontSize =
                      widgetFormat.label.fontSize + "px";
                    weatherDataElement.style.fontSize =
                      widgetFormat.value.fontSize + "px";
                    hlElement.style.fontSize = widgetFormat.hl.fontSize + "px";
                    var iconElement = document.getElementById(
                      "icon_" + commonId
                    );
                    iconElement.style.height = widgetFormat.icon.fontSize;
                    iconElement.style.width = widgetFormat.icon.fontSize;
                  }
                }
              }
            } else if (
              widgetData.data.weather_type == "24 Hour Weather Forecast" ||
              widgetData.data.weather_type == "5 Day Weather Forecast"
            ) {
              var id = widgetData.widgetSettingId + "_" + $scope.quoteIndex;
              var blockCount = 5;

              var _customHourlyclass = angular.element(".box_" + id);
              if (_customHourlyclass.length === 0) {
                $timeout($scope.resizeWeatherFont, 500);
                return;
              }

              angular.element(".iconParent_" + id).css({
                textAlign: widgetFormat.icon.alignment,
              });

              angular.element(".time_" + id).css({
                textAlign: widgetFormat.label.alignment,
                fontFamily: widgetFormat.label.fontFamily,
                color: widgetFormat.label.fontColor,
              });

              angular.element(".temperature_" + id).css({
                textAlign: widgetFormat.value.alignment,
                fontFamily: widgetFormat.value.fontFamily,
                color: widgetFormat.value.fontColor,
              });

              if (isVerticalLayout) {
                // 🔽 Vertical layout
                $scope.customHourlyclass = elementHeight / blockCount;
                if (widgetData.widgetBackgroundSettingModel.autofit) {
                  angular.element(".box_" + id).css({
                    height: $scope.customHourlyclass + "px",
                  });
                }

                for (var j = 0; j < blockCount; j++) {
                  if (widgetData.widgetBackgroundSettingModel.autofit) {
                    if (elementWidth < $scope.customHourlyclass) {
                      $scope.hourDataTextSize = (elementWidth * 22) / 100 / 1.5;
                      $scope.hourPredictionIconSize = (elementWidth * 48) / 100;
                    } else {
                      $scope.hourDataTextSize =
                        ($scope.customHourlyclass * 22) / 100 / 1.5;
                      $scope.hourPredictionIconSize =
                        ($scope.customHourlyclass * 48) / 100;
                    }

                    angular
                      .element(".icon_" + id)
                      .css({ width: $scope.hourPredictionIconSize + "px" });
                    angular
                      .element(".time_" + id)
                      .css({ fontSize: $scope.hourDataTextSize + "px" });
                    angular
                      .element(".temperature_" + id)
                      .css({ fontSize: $scope.hourDataTextSize + "px" });
                  } else {
                    angular
                      .element(".icon_" + id)
                      .css({ width: widgetFormat.icon.fontSize + "px" });
                    angular
                      .element(".time_" + id)
                      .css({ fontSize: widgetFormat.label.fontSize + "px" });
                    angular
                      .element(".temperature_" + id)
                      .css({ fontSize: widgetFormat.value.fontSize + "px" });

                    var parentelement = document.getElementById(
                      "weather_" + id
                    );
                    if (
                      parentelement.clientHeight < parentelement.scrollHeight
                    ) {
                      parentelement.style.alignItems = "unset";
                    }
                  }
                }
              } else {
                // ➡️ Horizontal layout
                $scope.customHourlyclass = elementWidth / 5.2;

                if (widgetData.widgetBackgroundSettingModel.autofit) {
                  if (elementHeight < $scope.customHourlyclass) {
                    $scope.hourDataTextSize = (elementHeight * 20) / 100;
                    $scope.hourPredictionIconSize = (elementHeight * 40) / 100;
                  } else {
                    $scope.hourDataTextSize =
                      ($scope.customHourlyclass * 20) / 100;
                    $scope.hourPredictionIconSize =
                      ($scope.customHourlyclass * 40) / 100;
                  }

                  angular
                    .element(".box_" + id)
                    .css({ width: $scope.customHourlyclass + "px" });
                  angular
                    .element(".icon_" + id)
                    .css({ width: $scope.hourPredictionIconSize + "px" });
                  angular
                    .element(".time_" + id)
                    .css({ fontSize: $scope.hourDataTextSize + "px" });
                  angular
                    .element(".temperature_" + id)
                    .css({ fontSize: $scope.hourDataTextSize + "px" });
                } else {
                  angular
                    .element(".box_" + id)
                    .css({ width: $scope.customHourlyclass + "px" });
                  angular
                    .element(".icon_" + id)
                    .css({ width: widgetFormat.icon.fontSize + "px" });
                  angular
                    .element(".time_" + id)
                    .css({ fontSize: widgetFormat.label.fontSize + "px" });
                  angular
                    .element(".temperature_" + id)
                    .css({ fontSize: widgetFormat.value.fontSize + "px" });
                }
              }
            }
          }
        }
      } catch (e) {
        console.log("Something went wrong while resizing weather widget");
      }
    };

    $scope.updateWeatherDataApi = function () {
      var weatherWidgetSettingId = [];
      angular.forEach($scope.weatherWidgetList, function (data) {
        weatherWidgetSettingId.push(data.widgetId);
      });

      var weatherWidgetIds = weatherWidgetSettingId.toString();

      $http({
        method: "PUT",
        url:
          MANGO_MIRROR_CONSTANT.API_WEATHER_DATA_UPDATE_URL +
          "/" +
          weatherWidgetIds,
        headers: {
          "Content-Type": "application/json",
          authtoken: $rootScope.authToken,
          "accept-language": "en-US, en; q = 0.8",
          source: "webApp",
        },
      }).then(
        function (res) {},
        function (error) {
          console.log(error);
        }
      );
    };

    $scope.mapWeatherData = function (widgetData, index, widgetIndex) {
      var weatherWidget = {
        widgetId: widgetData.widgetSettingId,
        widgetSetting: widgetData,
        pagenumber: [index],
        intervalObject: "",
        widgetIndexKey: [{ pagenumber: index, widgetIndexNumber: widgetIndex }],
      };

      var isDataFound = false;
      angular.forEach($scope.weatherWidgetList, function (data) {
        if (data.widgetId == widgetData.widgetSettingId) {
          isDataFound = true;
          var widgetIndexObject = {
            pagenumber: index,
            widgetIndexNumber: widgetIndex,
          };
          data.pagenumber.push(index);
          data.widgetIndexKey.push(widgetIndexObject);
        }
      });

      if (isDataFound == false) {
        $scope.weatherWidgetList.push(weatherWidget);
      }

      if ($scope.weatherWidgetList.length > 0) {
        if ($scope.weatherInterval != undefined) {
          $interval.cancel($scope.weatherInterval);
        }

        $scope.weatherInterval = $interval(function () {
          $scope.updateWeatherDataApi();
        }, 1800000);

        //									 $scope.weatherInterval = $interval(function() {
        //										 $scope.updateWeatherDataApi();
        //									 },10000);
      }
    };

    $scope.initWeather = function (widgetData, pageIndex, widgetIndex) {
      $scope.mapWeatherData(widgetData, pageIndex, widgetIndex);
      $scope.resizeWeatherFont();
    };

    $scope.loadDailyWeatherData = function (dailyWeatherData) {
      if (dailyWeatherData.data.type != "subscriptionError") {
        $scope.daysWeatherData = dailyWeatherData.data.dailyData;
        $scope.isDailyWeatherOn = true;
        if ($scope.noBleDataUpdateTimeInterval == "") {
          $scope.noBleDataUpdateTimeInterval = $interval(
            $scope.loadNoBleData,
            1800000
          );
        }
      }
    };

    $scope.Fahrenheit = false;
    $scope.Celsius = false;
    $scope.loadWeatherData = function (currentWeatherData) {
      if (currentWeatherData.data.type != "subscriptionError") {
        $scope.weather = currentWeatherData.data.currentData;
        $scope.isCurrentWeatherOn = true;

        if ($scope.noBleDataUpdateTimeInterval == "") {
          $scope.noBleDataUpdateTimeInterval = $interval(
            $scope.loadNoBleData,
            1800000
          );
        }
      }
    };

    $scope.loadHourlyWeatherData = function (hourlyWeatherData) {
      if (hourlyWeatherData.data.type != "subscriptionError") {
        $scope.hourlyWeatherData = hourlyWeatherData.data.hourlyData;
        $scope.is24HourWeatherOn = true;
        if ($scope.noBleDataUpdateTimeInterval == "") {
          $scope.noBleDataUpdateTimeInterval = $interval(
            $scope.loadNoBleData,
            1800000
          );
        }
      }
    };

    $scope.modifyTitleStyles = function (widgeSettingtId, widgetBgSetting) {
      var widgetFormat = JSON.parse(widgetBgSetting.widgetFormat);
      $timeout(function () {
        var calendarTitle = angular.element(
          "#calendar_" +
            widgeSettingtId +
            "_" +
            $scope.quoteIndex +
            " .fc-toolbar-title"
        );
        var titleStyles = {
          "font-size": widgetFormat.title.fontSize / 16 + "em",
          "font-family": widgetFormat.title.fontFamily,
          color: widgetFormat.title.fontColor,
        };

        if (calendarTitle.length) {
          calendarTitle.css(titleStyles);
        }
      }, 100);
    };

    $scope.openCalendarModal = function (events, widgetSettingId) {
      if (
        ($scope.currentlyEditWidgetSettingId > 0 &&
          widgetSettingId === $scope.currentlyEditWidgetSettingId) ||
        ($scope.gesture.touch_calendar_read &&
          !$scope.currentlyEditWidgetSettingId)
      ) {
        var hasAccountAccess = false;
        var account = "";
        for (var i = 0; i < $scope.calendarAccounts.length; i++) {
          if (
            ($scope.currentEventInfo.event._def.extendedProps
              .calendarAccountId != null &&
              $scope.calendarAccounts[i].id ==
                $scope.currentEventInfo.event._def.extendedProps
                  .calendarAccountId) ||
            ($scope.currentEventInfo.event._def.extendedProps.icalAccountId !=
              null &&
              $scope.calendarAccounts[i].id ==
                $scope.currentEventInfo.event._def.extendedProps.icalAccountId)
          ) {
            account = $scope.calendarAccounts[i];
            hasAccountAccess = $scope.currentlyEditWidgetSettingId
              ? account.isWriteAccess
              : true;
            $scope.eventType = account.calendarType;
            break;
          }
        }

        if (
          ($scope.currentlyEditWidgetSettingId && hasAccountAccess) ||
          (!$scope.currentlyEditWidgetSettingId && hasAccountAccess)
        ) {
          //											if(account.calendarType=="google" || account.calendarType=="outlook" || account.calendarType=="icalAccount"){
          $scope.eventDetailsInprogress = true;
          //get event details
          let payload = {
            accountId: ["icalAccount", "ics", "icalUrl"].includes(
              account.calendarType
            )
              ? $scope.currentEventInfo.event._def.extendedProps.icalAccountId
              : $scope.currentEventInfo.event._def.extendedProps
                  .calendarAccountId,
            calendarId:
              $scope.currentEventInfo.event._def.extendedProps.calendarId,
            eventId: $scope.currentEventInfo.event._def.extendedProps.eventId,
            calendarType: account.calendarType,
          };

          if (account.calendarType == "icalAccount") {
            payload.icalRecurrenceId =
              $scope.currentEventInfo.event._def.extendedProps.eventRecurrenceId;
          }

          $rootScope.showLoadingSpinner(
            $scope.currentlyEditWidgetSettingId,
            "Please wait...."
          );
          $scope
            .getEventDetails(payload)
            .then(function (result) {
              $scope.eventDetailsInprogress = false;
              $rootScope.hideLoadingSpinner(
                $scope.currentlyEditWidgetSettingId
              );
              var calendar = result.calendar;
              calendar.calendarAccountId = payload.accountId;
              if (account.calendarType == "google") {
                var event = result.event;
                event.eventId =
                  $scope.currentEventInfo.event._def.extendedProps.eventId;
                event.recurrenceEventId =
                  $scope.currentEventInfo.event._def.extendedProps.eventRecurrenceId;
                event.calendar = calendar;

                if (
                  $scope.gesture.touch_calendar_read &&
                  !$scope.currentlyEditWidgetSettingId
                ) {
                  event.isEdit = false;
                  event.evt = events.find(
                    (event) => event.eventId === payload.eventId
                  );
                  $scope.openModal(
                    event,
                    "calendar-view-event",
                    $scope.viewCalendarEventModal()
                  );
                } else {
                  if (
                    calendar != null &&
                    (calendar.accessRole == "owner" ||
                      calendar.accessRole == "writer")
                  ) {
                    event.isEdit = true;
                    $scope.openModal(
                      event,
                      MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CALENDAR,
                      $scope.calendarModal()
                    );
                  } else {
                    $scope.toasterMessage(
                      "Your account doesn't have edit permissions for this calendar."
                    );
                    return;
                  }
                }
              } else if (account.calendarType == "outlook") {
                var event = result.event;
                event.eventId =
                  $scope.currentEventInfo.event._def.extendedProps.eventId;
                event.recurrenceEventId =
                  $scope.currentEventInfo.event._def.extendedProps.eventRecurrenceId;
                event.calendar = calendar;
                if (
                  $scope.gesture.touch_calendar_read &&
                  !$scope.currentlyEditWidgetSettingId
                ) {
                  event.isEdit = false;
                  event.evt = events.find(
                    (event) => event.eventId === payload.eventId
                  );
                  $scope.openModal(
                    event,
                    "calendar-view-event",
                    $scope.viewCalendarEventModal()
                  );
                } else {
                  if (calendar != null && calendar.canEdit == true) {
                    event.isEdit = true;
                    $scope.openModal(
                      event,
                      MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CALENDAR,
                      $scope.calendarModal()
                    );
                  } else {
                    $scope.toasterMessage(
                      "Your account doesn't have edit permissions for this calendar."
                    );
                    return;
                  }
                }
              }  else if (account.calendarType == "icalAccount") {
                calendar.canEdit = calendar.isWriteAccess;
                
                  var event = result.event;
                  if (event.isRecurringFound == false) {
                    event.customSummary = $scope.currentEventInfo.event.title;
                    event.startDate =
                      $scope.currentEventInfo.event._def.extendedProps.eventStartDate;
                    event.endDate =
                      $scope.currentEventInfo.event._def.extendedProps.eventEndDate;
                  }

                  event.eventId =
                    $scope.currentEventInfo.event._def.extendedProps.eventId;
                  event.recurrenceEventId =
                    $scope.currentEventInfo.event._def.extendedProps.eventRecurrenceId;
                  event.calendar = calendar;
                  if (calendar.canEdit == true) {
                	  event.isEdit = true;
                  }else{
                	  event.isEdit = false;
                  }

                  if (
                    $scope.gesture.touch_calendar_read &&
                    !$scope.currentlyEditWidgetSettingId
                  ) {
                    event.evt = events.find(
                      (event) => event.eventId === payload.eventId
                    );
                    $scope.openModal(
                      event,
                      "calendar-view-event",
                      $scope.viewCalendarEventModal()
                    );
                  } else {
                	  if (calendar != null && calendar.canEdit == true) {
                		  $scope.openModal(
                				  event,
                				  MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CALENDAR,
                				  $scope.calendarModal()
                				  );
                	  } else {
                		  $scope.toasterMessage("Your account doesn't have edit permissions for this calendar.");
                		  return;
                    }
                    
                  }
              } else if (
                account.calendarType == "icalUrl" ||
                account.calendarType == "ics"
              ) {
                calendar.canEdit = calendar.isWriteAccess;
                if (calendar.canEdit == true) {
                  var event = result.event;

                  event.customSummary = $scope.currentEventInfo.event.title;
                  event.startDate =
                    $scope.currentEventInfo.event._def.extendedProps.eventStartDate;
                  event.endDate =
                    $scope.currentEventInfo.event._def.extendedProps.eventEndDate;

                  event.eventId =
                    $scope.currentEventInfo.event._def.extendedProps.eventId;
                  event.recurrenceEventId =
                    $scope.currentEventInfo.event._def.extendedProps.eventRecurrenceId;
                  event.calendar = calendar;
                  event.isEdit = true;

                  if (
                    $scope.gesture.touch_calendar_read &&
                    !$scope.currentlyEditWidgetSettingId
                  ) {
                    event.evt = events.find(
                      (event) => event.eventId === payload.eventId
                    );
                    $scope.openModal(
                      event,
                      "calendar-view-event",
                      $scope.viewCalendarEventModal()
                    );
                  } else {
                    $scope.openModal(
                      event,
                      MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CALENDAR,
                      $scope.calendarModal()
                    );
                  }
                } else {
                  $scope.toasterMessage(
                    "Your account doesn't have edit permissions for this calendar."
                  );
                  return;
                }
              }
            })
            .catch(function (error) {
              $scope.eventDetailsInprogress = false;
              $rootScope.hideLoadingSpinner(
                $scope.currentlyEditWidgetSettingId
              );
              console.error("An error occurred:", error);
            });

          //											}else{
          //												$scope.toasterMessage("Editing this Calendar Source is not supported yet.");
          //											}
        } else {
          $scope.toasterMessage(
            "Edit permissions haven't been granted for this calendar account yet."
          );
        }
      }
    };

    $scope.loadMangoChoresFamilyDetails = function (selectedLabel, accountId) {
      var baseUrl = "https://chores.mangodisplay.com?iframe=true&env=";
      var url = baseUrl;
      if (environment == "test") {
        url = url + "test";
      } else if (environment == "production") {
        url = url + "production";
      } else {
        return;
      }

      if (accountId != undefined) {
        url = url + ("&userId=" + accountId);
      } else {
        return;
      }

      if (selectedLabel.labelId != undefined) {
        url = url + ("&member=" + selectedLabel.labelId);
      } else {
        return;
      }

      if ($scope.gesture.touch_chores_family_access) {
        var trustedUrl = $sce.trustAsResourceUrl(url);
        $scope.openIframeModal(trustedUrl);
      }
    };

    $scope.openIframeModal = function (trustedUrl) {
      if ($scope.shouldAutoRotatePages()) {
        if (pageTimeout) {
          $interval.cancel(pageTimeout);
        }
      }

      var modalInstance = $uibModal.open({
        templateUrl: "templates/dynamicIframe.html",
        controller: "dynamicIframeModalCtrl",
        appendTo: angular.element(document.querySelector("#main")),
        resolve: {
          dynamic_iframe_url: function () {
            return trustedUrl;
          },
        },
      });
      modalInstance.result.then(
        function (eventData) {
          if ($scope.shouldAutoRotatePages()) {
            if (pageTimeout) {
              $interval.cancel(pageTimeout);
            }
            pageTimeout = $interval($scope.checkPageTimeOut, 1000);
          }
        },
        function (ex) {
          if ($scope.shouldAutoRotatePages()) {
            if (pageTimeout) {
              $interval.cancel(pageTimeout);
            }
            pageTimeout = $interval($scope.checkPageTimeOut, 1000);
          }
        }
      );
    };

    $scope.initialView = function (format, type) {
      var isContinuousMultiMonthView =
        format.calendarType == "Monthly" &&
        format.isMultiMonthView == true &&
        (format.multiMonthView == "continuous");

      if (format.calendarType == "Schedule") {
        if (format.schedule_days_selection == "next_x_days") {
          return "custom_schedule_view";
        } else {
          return type;
        }
      } else if (format.calendarType == "Weeks") {
        return "dayGridWeek";
      } else if (format.calendarType == "List") {
        if (format.listAllignment == "Horizontal") {
          return "listGrid";
        } else {
          return "listView";
        }
      }else if (format.calendarType == "Yearly") {
        if (format.multiMonthView == "timeline") {
          return "continuousMultiMonth";
        }
        return "multiMonth";
      } else {
    	  if (isContinuousMultiMonthView) {
    		  return "continuousMultiMonth";
    	  } else if(format.calendarType == "Monthly" && format.isMultiMonthView==true){
    		  return "multiMonth";
    	  }else{
    		  return type;	  
    	  }
      }
    };
    
    
    $scope.getOptimalMultiMonthColumns = function(totalMonths,availableWidth,availableHeight) 
    	{
            if (!totalMonths || totalMonths <= 1) {
              return 1;
            }

            var usableWidth = Math.max(1, availableWidth - 24);
            var usableHeight = Math.max(1, availableHeight - 16);
            var bestCols = 1;
            var bestScore = -Infinity;
            var monthHeaderHeight = 60;
            var targetMonthAspect = 1.1;
            var minMonthWidth = 500;
            var maxColsByWidth = Math.floor(usableWidth / minMonthWidth);
            var maxColsToTry = Math.max(1, Math.min(totalMonths, maxColsByWidth));

            for (var cols = 1; cols <= maxColsToTry; cols++) {
              var rows = Math.ceil(totalMonths / cols);
              var monthWidth = usableWidth / cols;
              var monthHeight = usableHeight / rows;
              var gridHeight = Math.max(1, monthHeight - monthHeaderHeight);
              var dayCellWidth = monthWidth / 7;
              var dayCellHeight = gridHeight / 6;
              var monthAspect = monthWidth / Math.max(1, monthHeight);
              var aspectPenalty = Math.abs(
                Math.log(monthAspect / targetMonthAspect)
              );
              var score =
                Math.min(dayCellWidth, dayCellHeight) * 100 +
                Math.sqrt(Math.max(1, dayCellWidth * dayCellHeight)) -
                aspectPenalty * 18;

              if (score > bestScore) {
                bestScore = score;
                bestCols = cols;
              }
            }
            return bestCols;
        }

    $scope.isCalendarPresetWidget = function (calendarwidget, widgetBackgroundSetting) {
      if (!calendarwidget || !widgetBackgroundSetting) {
        return false;
      }

      var contentType = String(calendarwidget.contentType || "")
        .trim()
        .toLowerCase();
      var backgroundFormatType = String(
        widgetBackgroundSetting.backgroundFormatType || ""
      )
        .trim()
        .toLowerCase();

      return (
        (contentType == "calendar" || contentType == "mealplan") &&
        backgroundFormatType == "preset"
      );
    };

    $scope.beginCalendarPresetRender = function (
      calendarwidget,
      widgetBackgroundSetting
    ) {
      if (!$scope.isCalendarPresetWidget(calendarwidget, widgetBackgroundSetting)) {
        return null;
      }

      calendarwidget._calendarPresetRenderToken =
        (calendarwidget._calendarPresetRenderToken || 0) + 1;
      calendarwidget.isCalendarRenderResizeComplete = false;

      return calendarwidget._calendarPresetRenderToken;
    };

    $scope.completeCalendarPresetRender = function (
      calendarwidget,
      renderToken,
      delay
    ) {
      if (!calendarwidget || renderToken == null) {
        return;
      }

      $timeout(function () {
        if (calendarwidget._calendarPresetRenderToken != renderToken) {
          return;
        }

        calendarwidget.isCalendarRenderResizeComplete = true;
      }, delay || 0);
    };

    $scope.getPresetAwareWidgetSize = function (
      calendarwidget,
      widgetBackgroundSetting
    ) {
      var usePresetSize = $scope.isCalendarPresetWidget(
        calendarwidget,
        widgetBackgroundSetting
      );

      return {
        height: usePresetSize
          ? Number(calendarwidget.renderHeight) || calendarwidget.height
          : calendarwidget.height,
        width: usePresetSize
          ? Number(calendarwidget.renderWidth) || calendarwidget.width
          : calendarwidget.width,
      };
    };

    $scope.drawFullCalendar = function (
      eventList,
      type,
      format,
      widgetSettingId,
      isInitialCall,
      language,
      defaultStartDate,
      widgetBackgroundSetting,
      calendarwidget
    ) {
      var widgetFormat = JSON.parse(widgetBackgroundSetting.widgetFormat);
      var widgetTitleFormat = JSON.parse(
        widgetBackgroundSetting.widgetTitleFormat
      );
      var presetAwareWidgetSize = $scope.getPresetAwareWidgetSize(
        calendarwidget,
        widgetBackgroundSetting
      );
      var widgetHeight = presetAwareWidgetSize.height;
      var widgetWidth = presetAwareWidgetSize.width;

      var wrap = "";
      if (format.word_wrap == "one_line") {
        wrap = "singleLine";
      } else if (format.word_wrap == "two_line") {
        wrap = "twoLine";
      } else {
        wrap = "multiLine";
      }

      var calHeight = widgetHeight - 3;
      if (widgetBackgroundSetting.isNameVisible == true) {
        calHeight = calHeight - widgetTitleFormat.fontSize * 1.5;
      }

      if (format.schedule_title == true && format.calendarType != "List") {
        calHeight = calHeight - widgetFormat.title.fontSize * 1.85;
      }

      if (format.showLegends == true) {
        calHeight = calHeight - 31;
      }

      calHeight = Math.ceil(calHeight);
      var isYearlyStripRender = format.isYearlyStripRender === true;
      var calendarPresetRenderToken = isYearlyStripRender
        ? null
        : $scope.beginCalendarPresetRender(
            calendarwidget,
            widgetBackgroundSetting
          );
      var interactiveWidgetSettingId =
        format.sourceWidgetSettingId || widgetSettingId;

      var header = {
        left: format.schedule_title ? "title" : "",
        center: "",
        right: "",
      };
      if (widgetFormat.title.alignment.toLowerCase() == "center") {
        header.left = "";
        header.center = format.schedule_title ? "title" : "";
        header.right = "";
      } else if (widgetFormat.title.alignment.toLowerCase() == "right") {
        header.left = "";
        header.center = "";
        header.right = format.schedule_title ? "title" : "";
      }

      // detect horizontal list mode
      var isHorizontalList =
        format.calendarType == "List" && format.listAllignment == "Horizontal";

      // helpers for horizontal mode
      function toDate(val) {
        if (!val) return null;
        var d = val instanceof Date ? new Date(val) : new Date(val);
        return isNaN(d) ? null : d;
      }
      function startOfDay(d) {
        var x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x;
      }

      var uniqueDates = [];
      var minDate = null,
        maxDate = null;

      if (isHorizontalList && Array.isArray(eventList) && eventList.length) {
        var uniq = new Set();
        eventList.forEach(function (e) {
          var raw = e.start || e.date || e.startTime || e.startStr;
          var d = toDate(raw);
          if (d) {
            var sod = startOfDay(d);
            var ms = sod.getTime();
            if (!uniq.has(ms)) {
              uniq.add(ms);
              if (!minDate || sod < minDate) minDate = sod;
              if (!maxDate || sod > maxDate) maxDate = sod;
            }
          }
        });
        uniqueDates = Array.from(uniq)
          .sort()
          .map(function (ms) {
            const date = new Date(ms);
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
            const dd = String(date.getDate()).padStart(2, "0");
            return `${yyyy}-${mm}-${dd}`;
          });
      }

      var selectedWeeksCount = format.w_weeksToShow;
      if (format.w_selectedWeeks) {
        try {
          var selectedWeeks = JSON.parse(format.w_selectedWeeks);
          if (Array.isArray(selectedWeeks) && selectedWeeks.length > 0) {
            selectedWeeksCount = selectedWeeks.length;
          }
        } catch (e) {
          // Fallback to configured weeks-to-show when selected weeks is not valid JSON
        }
      }

      var isYearlyCalendarEnabled =
        format.isYearlyCalendarEnabled === true ||
        format.isYearlyCalendarEnabled === "true";
      var isYearlyMonthGridView =
        format.calendarType == "Yearly" &&
        format.multiMonthView == "month_grid";
      var isYearlyGridMultiMonthView = isYearlyMonthGridView;

      var selectedMonthsCount = 1;
      if (format.calendarType == "Yearly") {
        if (isYearlyCalendarEnabled) {
          selectedMonthsCount = 12;
        } else if (format.y_selectedMonths) {
          try {
            var yearlySelectedMonths = JSON.parse(format.y_selectedMonths);
            if (
              Array.isArray(yearlySelectedMonths) &&
              yearlySelectedMonths.length > 0
            ) {
              selectedMonthsCount = yearlySelectedMonths.length;
            }
          } catch (e) {
            // Fallback to a single month when yearly selected months is not valid JSON
          }
        }
      } else if (format.m_selectedMonths) {
        try {
          var selectedMonths = JSON.parse(format.m_selectedMonths);
          if (Array.isArray(selectedMonths) && selectedMonths.length > 0) {
            selectedMonthsCount = selectedMonths.length;
          }
        } catch (e) {
          // Fallback to a single month when selected months is not valid JSON
        }
      }

      var isContinuousMultiMonthView =
        format.calendarType == "Monthly" &&
        format.isMultiMonthView == true &&
        (format.multiMonthView == "continuous");
      var isWeekdaysOnly =
        format.showWeekDaysOnly === true || format.showWeekDaysOnly === "true";
      var isYearlyTimelineView =
        format.calendarType == "Yearly" &&
        format.multiMonthView == "timeline";
      var shouldApplyMonthlyContinuousWeekPacking =
        isContinuousMultiMonthView && selectedMonthsCount > 1;
      var shouldApplyYearlyTimelineWeekPacking =
        isYearlyTimelineView && selectedMonthsCount > 1;
      var shouldApplyContinuousWeekPacking =
        shouldApplyMonthlyContinuousWeekPacking ||
        shouldApplyYearlyTimelineWeekPacking;
      var isContinuousTimelineView =
        isContinuousMultiMonthView || isYearlyTimelineView;
      var shouldApplyWeekendTitleColorForTimelineViews =
        isYearlyTimelineView ||
        (format.calendarType == "Monthly" && isContinuousMultiMonthView);
      var resolvedWeekendTitleColor =
        widgetFormat.title &&
        widgetFormat.title.fontColor &&
        widgetFormat.title.fontColor !== "default"
          ? widgetFormat.title.fontColor
          : null;

      var optimalMultiMonthColumns = 1;
      var isGridMultiMonthView =
        (format.calendarType == "Monthly" &&
          format.isMultiMonthView == true &&
          !isContinuousMultiMonthView &&
          format.multiMonthView == "grid") ||
        isYearlyGridMultiMonthView;
      var isStackMultiMonthView =
        format.calendarType == "Monthly" &&
        format.isMultiMonthView == true &&
        !isContinuousMultiMonthView &&
        format.multiMonthView == "stack";
      var effectiveGridMonthsCount = selectedMonthsCount;
      var effectiveStackMonthsCount = selectedMonthsCount;
      if (isGridMultiMonthView) {
        var minGridMonthHeight = 350;
        var gridHeightBudget = Math.max(1, calHeight - 10);
        var fitMonths = 1;
        var fitCols = 1;

        for (var visibleMonths = selectedMonthsCount; visibleMonths >= 1; visibleMonths--) {
          var colsForVisibleMonths = $scope.getOptimalMultiMonthColumns(
            visibleMonths,
            widgetWidth,
            calHeight
          );
          if (!colsForVisibleMonths || colsForVisibleMonths < 1) {
            colsForVisibleMonths = 1;
          }

          var rowsForVisibleMonths = Math.ceil(
            visibleMonths / colsForVisibleMonths
          );
          fitMonths = visibleMonths;
          fitCols = colsForVisibleMonths;

          if (rowsForVisibleMonths * minGridMonthHeight <= gridHeightBudget) {
            break;
          }
        }

        effectiveGridMonthsCount = fitMonths;
        optimalMultiMonthColumns = fitCols;
      } else if (isStackMultiMonthView) {
        var minStackMonthHeight = 350;
        var stackHeightBudget = Math.max(1, calHeight - 10);
        var maxStackVisibleMonths = Math.max(
          1,
          Math.floor(stackHeightBudget / minStackMonthHeight)
        );
        effectiveStackMonthsCount = Math.min(
          selectedMonthsCount,
          maxStackVisibleMonths
        );
      }

      var handleCalendarEventClick = function (info) {
        if ($scope.isGestureFeatureEnabled === false) {
          return;
        }
        $scope.currentEventInfo = info;
        if (calendarwidget.contentType == "mealplan") {
          if ($scope.gesture.touch_mealplan_read) {
            var url =
              $scope.currentEventInfo.event._def.extendedProps.recipeUrl;
            if (url && url.trim() !== "") {
              if (url.startsWith("https://www.allrecipes.com")) {
                var trustedUrl = $sce.trustAsResourceUrl(
                  "https://recipereader.mangodisplay.com?url=" + url
                );
                $scope.openIframeModal(trustedUrl);
              } else {
                var trustedUrl = $sce.trustAsResourceUrl(url);
                $scope.openIframeModal(trustedUrl);
              }
            }
          }
        } else {
          if ($scope.currentlyEditWidgetSettingId) {
            // It's a double click
            $timeout.cancel($scope.clickTimer);
            $scope.clickTimer = null;
            if ($scope.gesture.touch_calendar_edit) {
              $scope.openCalendarModal(eventList, interactiveWidgetSettingId);
            }
          } else if (
            $scope.gesture.touch_calendar_read &&
            !$scope.currentlyEditWidgetSettingId
          ) {
            // Start the timer to detect if a second click follows
            $scope.clickTimer = $timeout(function () {
              $rootScope.showLoadingSpinner(interactiveWidgetSettingId);
              APIServices.getCalendarAccounts()
                .success(function (data) {
                  $scope.calendarAccounts = data.object;
                  $scope.openCalendarModal(eventList, interactiveWidgetSettingId);
                  $rootScope.hideLoadingSpinner(interactiveWidgetSettingId);
                })
                .error(function (data, status) {
                  $scope.clearEdit(interactiveWidgetSettingId);
                  $rootScope.hideLoadingSpinner(interactiveWidgetSettingId);
                  console.log(
                    "There are some issues while accessing account details"
                  );
                });
            }, 500);
          }
        }
      };

      var getLegacySafeCalendarDateJustifyContent = function (alignment) {
        if (alignment == "left") {
          return "flex-end";
        }
        if (alignment == "right") {
          return "flex-start";
        }
        return alignment;
      };

      var applyCalendarDateAlignment = function (dateTopEl) {
        if (!dateTopEl) {
          return;
        }
        dateTopEl.style.justifyContent = widgetFormat.date.alignment;
        if (
          document.documentElement.className.indexOf("mm-legacy-weather") !== -1
        ) {
          dateTopEl.style.justifyContent =
            getLegacySafeCalendarDateJustifyContent(
              widgetFormat.date.alignment
            );
        }
      };

      var calendarBuildObject = {
        headerToolbar: format.calendarType == "List" ? false : header,
        dayMaxEvents: false,
        editable: false,
        fixedWeekCount: isContinuousTimelineView ? false : true,
        contentHeight: calHeight,
        nowIndicator: true,
        navLinks: false,
        rerenderDelay: 500,
        locale: language,
        initialDate: isHorizontalList
          ? minDate || defaultStartDate
          : defaultStartDate,
        expandRows: false,
        initialView: $scope.initialView(format, type),
        views: {
          dayGridWeek: {
            type: "dayGrid",
            dayHeaderFormat: { weekday: "short" },
            duration: {
              weeks: selectedWeeksCount,
            },
            dayCellContent: function (arg) {
            	var day = arg.date.getDate();
            	if (day === 1) {
            	    var monthName = arg.date.toLocaleDateString(language, { month: "short" });
            	    return { html: monthName + ' <span class="cal-day-num">' + day + '</span>' };
            	}
            	return { html: '<span class="cal-day-num">' + day + '</span>' };
            },
            fixedWeekCount: false,
          },
          continuousMultiMonth: {
            type: "dayGrid",
            duration: {
              months: selectedMonthsCount,
            },
            dayHeaderFormat: { weekday: "short" },
            fixedWeekCount: false,
            dayCellContent: function (arg) {
              var day = arg.date.getDate();
              if (day === 1) {
                var monthName = arg.date.toLocaleDateString(language, { month: "short" });
                return { html: monthName + ' <span class="cal-day-num">' + day + '</span>' };
              }
              return { html: '<span class="cal-day-num">' + day + '</span>' };
            },
          },
          listView: {
            type: "list",
            duration: { days: 180 },
          },
          custom_schedule_view: {
            type: "timeGridWeek",
            duration: { days: format.list_no_days },
          },
          listGrid: {
            type: "dayGrid",
            duration: {
              days:
                isHorizontalList && minDate && maxDate
                  ? Math.floor(
                      (startOfDay(maxDate) - startOfDay(minDate)) /
                        (24 * 60 * 60 * 1000)
                    ) + 1
                  : uniqueDates.length || 1,
            },
            dayHeaderFormat: { month: "long", day: "numeric", weekday: "long" },
            fixedWeekCount: false,
            weekNumbers: false,
          },
        },
        weekNumbers: false,
        eventClassNames:
          (format.calendarType == "Weeks" &&
            format.word_wrap == "multi_line") ||
          (format.calendarType == "List" &&
            calendarwidget.contentType == "mealplan")
            ? "multiLine"
            : "",
        displayEventEnd: format.showEndDate,
        dayHeaders: true,
        eventTimeFormat: {
          hour: "numeric",
          minute: "numeric",
          meridiem: "short",
          hour12: !calendarwidget.data.hour24Format,
          omitZeroMinute: false,
        },
        slotLabelFormat: {
          hour: "numeric",
          minute: "numeric",
          meridiem: "short",
          hour12: !calendarwidget.data.hour24Format,
          omitZeroMinute: false,
        },
        firstDay: format.weekStartWith == "Monday" ? 1 : 0,
        events: eventList,
        eventClick: function (info) {
          handleCalendarEventClick(info);
        },
      };
      
      if (format.calendarType == "Monthly" && format.isMultiMonthView == true) {
        var monthlyMultiMonthDuration =
          format.multiMonthView == "grid"
            ? effectiveGridMonthsCount
            : format.multiMonthView == "stack"
            ? effectiveStackMonthsCount
            : selectedMonthsCount;
        calendarBuildObject["duration"] = { months: monthlyMultiMonthDuration };
        if (format.multiMonthView == "stack") {
          calendarBuildObject["multiMonthMaxColumns"] = 1;
        } else if (format.multiMonthView == "grid") {
          calendarBuildObject["multiMonthMaxColumns"] = optimalMultiMonthColumns;
          calendarBuildObject["multiMonthMinWidth"] = 500;
        }
      } else if (isYearlyGridMultiMonthView) {
        calendarBuildObject["duration"] = { months: effectiveGridMonthsCount };
        calendarBuildObject["multiMonthMaxColumns"] = optimalMultiMonthColumns;
        calendarBuildObject["multiMonthMinWidth"] = 500;
      }
      
      if (calendarwidget.data != undefined && format.calendarType == "List") {
        calendarBuildObject["validRange"] = {
          start: calendarwidget.data.dateRangeStart,
          end: calendarwidget.data.dateRangeEnd,
        };
      }

      if (calendarwidget.contentType == "mealplan") {
        calendarBuildObject["eventOrderStrict"] = true;
        calendarBuildObject["eventOrder"] = true;
      }

      if (
        format.calendarType != "List" &&
        calendarBuildObject.initialView != "timeGrid"
      ) {
        calendarBuildObject["weekends"] = !isWeekdaysOnly;
      }

      calendarBuildObject["viewDidMount"] = function (arg) {
        if (
          (calendarwidget.contentType != "mealplan") &
          (format.calendarType != "List")
        ) {
          var calendarEl = document.getElementById(
            fullcalendarId + "_" + $scope.quoteIndex
          );

          if (format.calendarType == "Schedule") {
            const slots = calendarEl.querySelectorAll(".fc-timegrid-slot");
            slots.forEach((slot) => {
              slot.style.fontFamily = widgetFormat.date.fontFamily;
              slot.style.fontSize = widgetFormat.date.fontSize + "px";
            });
          }

          const tdElements = calendarEl.querySelectorAll("td, th");
          const tables = calendarEl.querySelectorAll("table");
          tables.forEach((table) => {
            table.style.border = "none";
            if (widgetFormat.gridline.format == "top") {
              table.style.borderSpacing = "10px 0px";
              table.style.borderCollapse = "separate";
            }
          });

          if (
            widgetFormat.gridline.format == "top" ||
            widgetFormat.gridline.format == "all"
          ) {
            tdElements.forEach((td) => {
              td.style.border = "none";
              if (widgetFormat.gridline.format == "top") {
                td.style.borderTop =
                  widgetFormat.gridline.thickness.width +
                  "px " +
                  widgetFormat.gridline.thickness.style +
                  " " +
                  widgetFormat.gridline.fontColor;
              } else if (widgetFormat.gridline.format == "all") {
                td.style.border =
                  widgetFormat.gridline.thickness.width +
                  "px " +
                  widgetFormat.gridline.thickness.style +
                  " " +
                  widgetFormat.gridline.fontColor;
              }
            });

            // Get the single top-level table
            const topTable = calendarEl.querySelector("table");

            if (topTable) {
              if (format.calendarType != "Schedule") {
                topTable.style.borderSpacing = "1px";
              }
              var topLevelTDs;

              if (Array.prototype.flatMap) {
                // Modern browsers (ES2019+)
                topLevelTDs = Array.from(topTable.rows)
                  .flatMap((row) => Array.from(row.cells))
                  .filter((td) => td.closest("table") === topTable);
              } else {
                // Legacy fallback (Chrome v51 and older)
                topLevelTDs = [];
                var rows = topTable.rows;
                for (var i = 0; i < rows.length; i++) {
                  var cells = rows[i].cells;
                  for (var j = 0; j < cells.length; j++) {
                    var td = cells[j];
                    if (td.closest("table") === topTable) {
                      topLevelTDs.push(td);
                    }
                  }
                }
              }

              topLevelTDs.forEach((td) => {
                // Preserve borders on multimonth header cells
                if (!td.closest(".fc-multimonth-header-table")) {
                  td.style.border = "none";
                }
              });
            }
          } else {
            tdElements.forEach((td) => {
              td.style.border = "none";
            });

            if (
              format.calendarType == "Schedule" &&
              (widgetFormat.gridline.format == "none" ||
                widgetFormat.gridline.format == "top")
            ) {
              angular
                .element(
                  "#" +
                    fullcalendarId +
                    "_" +
                    $scope.quoteIndex +
                    " .fc-timegrid-divider"
                )
                .css({
                  background: "none",
                });
            }

            if (widgetFormat.gridline.format == "outer") {
              var calendarMasterTable = calendarEl.querySelector("table");
              calendarMasterTable.style.border =
                widgetFormat.gridline.thickness.width +
                "px " +
                widgetFormat.gridline.thickness.style +
                " " +
                widgetFormat.gridline.fontColor;
            }
          }
        }

        arg.el.style.fontSize = widgetFormat.event.fontSize / 16 + "em";
        if (format.calendarType != "List") {
          var fontSize = widgetFormat.title.fontSize / 16;
          var toolbarEl =
            arg.el.parentElement && arg.el.parentElement.previousElementSibling;
          if (toolbarEl) {
            if (widgetFormat.title.fontColor == "default") {
              toolbarEl.style.color = "unset";
            } else {
              toolbarEl.style.color = widgetFormat.title.fontColor;
            }
            toolbarEl.style.fontFamily = widgetFormat.title.fontFamily;

            var toolbarTitles = toolbarEl.querySelectorAll(".fc-toolbar-title");
            Array.prototype.forEach.call(toolbarTitles, function (titleEl) {
              titleEl.style.fontSize = fontSize + "em";
              titleEl.style.fontFamily = widgetFormat.title.fontFamily;
              if (widgetFormat.title.fontColor == "default") {
                titleEl.style.color = "unset";
              } else {
                titleEl.style.color = widgetFormat.title.fontColor;
              }
              titleEl.style.fontWeight = "inherit";
            });
          }

          if (
            (format.calendarType == "Monthly" &&
              format.isMultiMonthView == true) ||
            isYearlyGridMultiMonthView
          ) {
            var multiMonthTitles = calendarEl.querySelectorAll(
              ".fc-multimonth-title"
            );
            Array.prototype.forEach.call(multiMonthTitles, function (titleEl) {
              titleEl.style.fontSize = fontSize + "em";
              titleEl.style.fontFamily = widgetFormat.title.fontFamily;
              if (widgetFormat.title.fontColor == "default") {
            	  titleEl.style.color = "unset";
	          } else {
	        	  titleEl.style.color = widgetFormat.title.fontColor;
	          }
              titleEl.style.textAlign = widgetFormat.title.alignment;
              titleEl.style.fontWeight = "inherit";
            });
          }
          arg.el.parentElement.previousElementSibling.style.fontFamily =
            widgetFormat.title.fontFamily;         
        }
      };

      calendarBuildObject["noEventsDidMount"] = function (arg) {
        arg.el.style.backgroundColor = "red !important";
        arg.el.firstElementChild.style.display = "none";
      };

      //font size adjustment for header like mon,tue
      var dayHeaderElement = "";
      calendarBuildObject["dayHeaderDidMount"] = function (info) {
        if (isHorizontalList && info.view.type === "listGrid") {
          if (uniqueDates.includes(info.el.dataset.date)) {
            info.el.style.paddingLeft = "10px";
            info.el.firstChild.firstChild.style.fontSize =
              widgetFormat.date.fontSize / 16 + "rem";
            info.el.firstChild.firstChild.style.color =
              widgetFormat.date.fontColor == "default"
                ? "unset"
                : widgetFormat.date.fontColor;
            info.el.firstChild.firstChild.style.display = "flex";
            info.el.firstChild.firstChild.style.justifyContent =
              widgetFormat.date.alignment;
            info.el.firstChild.firstChild.style.fontFamily =
              widgetFormat.date.fontFamily;
          } else {
            info.el.style.display = "none";
          }
          return;
        }

        var fontSize = widgetFormat.day.fontSize / 16;
        if (format.calendarType == "List") {
	    	if((format.list_event_type=="Today" || format.list_event_type=="Tomorrow") && format.showDate==false){
	    		info.el.style.display="none";
	    	}
          info.el.cells[0].style.border = "none";
          info.el.firstChild.firstChild.style.fontWeight = "normal";
          info.el.firstChild.firstChild.style.fontSize =
            widgetFormat.date.fontSize / 16 + "rem";

          if (widgetFormat.date.fontColor == "default") {
            info.el.firstChild.firstChild.firstChild.style.color = "unset";
          } else {
            info.el.firstChild.firstChild.firstChild.style.color =
              widgetFormat.date.fontColor;
          }

          info.el.firstChild.firstChild.style.fontFamily =
            widgetFormat.date.fontFamily;
          info.el.firstChild.firstChild.style.justifyContent =
            widgetFormat.date.alignment;
        } else {
          info.el.firstChild.firstChild.style.fontSize =
            widgetFormat.day.fontSize / 16 + "em";
          if (widgetFormat.day.fontColor == "default") {
            info.el.firstChild.firstChild.style.color = "unset";
          } else {
            info.el.firstChild.firstChild.style.color =
              widgetFormat.day.fontColor;
          }
          info.el.firstChild.firstChild.style.display = "flex";
          info.el.firstChild.firstChild.style.justifyContent =
            widgetFormat.day.alignment;
          info.el.firstChild.firstChild.style.fontFamily =
            widgetFormat.day.fontFamily;
          if (
            shouldApplyWeekendTitleColorForTimelineViews &&
            resolvedWeekendTitleColor &&
            info.date
          ) {
            var headerDayOfWeek = info.date.getDay();
            if (headerDayOfWeek === 0 || headerDayOfWeek === 6) {
              info.el.firstChild.firstChild.style.color =
                resolvedWeekendTitleColor;
            }
          }
        }
      };

      var calendarWeatherOverlay = window.CalendarWeatherOverlay;
      var calendarWeatherByDate =
        format.calendarWeatherByDate ||
        calendarwidget.calendarWeatherByDate ||
        (calendarwidget.data && calendarwidget.data.calendarWeatherByDate) ||
        {};
      var isCalendarWeatherOverlayEnabled =
        format.showCalendarWeatherOverlay == true ||
        calendarwidget.showCalendarWeatherOverlay == true ||
        (calendarwidget.data &&
          calendarwidget.data.showCalendarWeatherOverlay == true);
      var isWeatherOverlaySupportedCalendarView =
        format.calendarType == "Monthly" || format.calendarType == "Weeks";
      var isCalendarWeatherOverlayRenderable = function () {
        return (
          !!calendarWeatherOverlay &&
          isCalendarWeatherOverlayEnabled &&
          calendarwidget.contentType == "calendar"
        );
      };

      var getCalendarWeatherForDate = function (dateValue) {
        if (
          !isCalendarWeatherOverlayRenderable() ||
          !dateValue ||
          !calendarWeatherOverlay.formatDateKey
        ) {
          return null;
        }

        var dateKey = calendarWeatherOverlay.formatDateKey(dateValue);
        return calendarWeatherByDate[dateKey] || null;
      };

      var applyCalendarWeatherOverlay = function (arg) {
        if (
          !arg ||
          !arg.date ||
          !arg.el ||
          !isWeatherOverlaySupportedCalendarView ||
          !isCalendarWeatherOverlayRenderable()
        ) {
          return;
        }

        var weather = getCalendarWeatherForDate(arg.date);
        calendarWeatherOverlay.applyToFullCalendarDayCell(arg.el, weather);
      };

      if (format.calendarType == "Schedule") {
        calendarBuildObject["slotLabelDidMount"] = function (info) {
          if (widgetFormat.date.fontColor == "default") {
            info.el.style.color = "unset";
          } else {
            info.el.style.color = widgetFormat.date.fontColor;
          }
          info.el.style.justifyContent = widgetFormat.date.alignment;
        };

        calendarBuildObject["allDayDidMount"] = function (info) {
          info.el.style.color = widgetFormat.date.fontColor;
          info.el.style.fontSize = widgetFormat.date.fontSize + "px";
          if (widgetFormat.date.fontColor == "default") {
            info.el.style.color = "unset";
          } else {
            info.el.style.color = widgetFormat.date.fontColor;
          }

          info.el.style.justifyContent = widgetFormat.date.alignment;
          info.el.style.fontFamily = widgetFormat.date.fontFamily;
        };

        // set min and max time
        var end = format.day_end_time + 1;
        calendarBuildObject["slotMinTime"] = format.day_start_time + ":00";
        calendarBuildObject["slotMaxTime"] = end + ":00";
        calendarBuildObject["dayHeaderFormat"] = { weekday: "short" };
        //set title format"
        calendarBuildObject["titleFormat"] = {
          month: "short",
          day: "numeric",
          weekday: "short",
        };
        if (calendarwidget.contentType == "calendar") {
          calendarBuildObject["eventDidMount"] = function (info) {
            var span = document.createElement("span");

            if (
              info.backgroundColor != undefined &&
              info.backgroundColor.trim().length > 2
            ) {
              var readableTextColor = colorUtilsService.getReadableTextColor(
                info.backgroundColor,
                widgetBackgroundSetting.fontColor
              );
              info.el.firstChild.firstChild.style.color = readableTextColor;
            }

            if (info.timeText !== "") {
            	if(format.showStartTime==true){
            		var timeSpan = document.createElement("span");
                    timeSpan.style.fontWeight = "normal";
                    timeSpan.textContent = info.timeText;
                    timeSpan.classList.add("fc-event-time");
                    span.appendChild(timeSpan);	
            	}
            	
              span.classList.add("fc-event-title", "fc-sticky", "multiLine");
              var textNode = document.createTextNode(" " + info.event.title);
              span.appendChild(textNode);

              if (info.el.firstChild.firstChild.childNodes.length > 0) {
                for (
                  var i = 0;
                  i < info.el.firstChild.firstChild.childNodes.length;
                  i++
                ) {
                  if (
                    info.el.firstElementChild.firstElementChild.childNodes[i]
                      .style != undefined
                  ) {
                    info.el.firstElementChild.firstElementChild.childNodes[
                      i
                    ].style.display = "none";
                  }
                }

                var contrastColor = colorUtilsService.getReadableTextColor(
                  info.backgroundColor,
                  widgetFormat.event.fontColor
                );
                span.style.color = contrastColor;
                span.style.fontFamily = widgetFormat.event.fontFamily;
                span.style.width = "100%";
                span.style.textAlign = widgetFormat.event.alignment;

                info.el.firstChild.firstChild.appendChild(span);
              }
            } else {
              if (
                info.backgroundColor == undefined ||
                info.backgroundColor.trim() == ""
              ) {
                info.el.firstChild.firstChild.style.color =
                  widgetFormat.event.fontColor;
              } else {
                var contrastColor = colorUtilsService.getReadableTextColor(
                  info.backgroundColor,
                  widgetFormat.event.fontColor
                );
                info.el.firstChild.firstChild.style.color = contrastColor;
              }
              info.el.firstChild.firstChild.style.fontFamily =
                widgetFormat.event.fontFamily;
              info.el.firstChild.firstChild.style.width = "100%";
              info.el.firstChild.firstChild.style.textAlign =
                widgetFormat.event.alignment;
            }
          };
        }
      } else if (format.calendarType == "Weeks") {
        calendarBuildObject["dayCellDidMount"] = function (arg) {
          var date = arg.date.getDate() + "-" + arg.date.getMonth();
          var image = isImageExist(date, eventList);
          applyCalendarDateAlignment(arg.el.firstChild.firstChild);
          if (widgetFormat.date.fontColor == "default") {
            arg.el.firstChild.firstChild.firstChild.style.color = "unset";
          } else {
            arg.el.firstChild.firstChild.firstChild.style.color =
              widgetFormat.date.fontColor;
          }

          arg.el.firstChild.firstChild.style.fontFamily =
            widgetFormat.date.fontFamily;
          arg.el.firstChild.firstChild.style.fontSize =
            widgetFormat.date.fontSize / 16 + "em";
          if(arg.isDisabled==false){
        	  applyCalendarWeatherOverlay(arg);  
          }
        };

        if (calendarwidget.contentType == "mealplan") {
          calendarBuildObject["eventDidMount"] = function (info) {
            if (info.event.extendedProps.imageUrl != null) {
              info.el.firstElementChild.firstElementChild.style.display =
                "none";
              var div = document.createElement("div");
              if (info.event.extendedProps.location == "1") {
                info.el.classList.add("btn-success");
              } else if (info.event.extendedProps.location == "2") {
                info.el.classList.add("btn-info");
              } else if (info.event.extendedProps.location == "3") {
                info.el.classList.add("btn-danger");
              }
              
              if(info.backgroundColor=="" || info.backgroundColor=="null" || info.backgroundColor==undefined){
            	  info.el.style.backgroundColor = "unset";
            	  info.el.style.border = "unset";
              }

              var imageUrl = info.event.extendedProps.imageUrl;
              if (imageUrl != undefined && imageUrl != null && imageUrl != "") {
                var subdiv = document.createElement("div");
                var img = document.createElement("img");
                img.src = info.event.extendedProps.imageUrl;
                img.alt = "image not accessible";
                if (format.image_size == "Small") {
                  img.style.width = "50%";
                } else if (format.image_size == "Medium") {
                  img.style.width = "75%";
                } else if (format.image_size == "Large") {
                  img.style.width = "100%";
                }
                if (format.image_size != "Off") {
                  subdiv.appendChild(img);
                }
                subdiv.classList.add("center-element");
                subdiv.style.padding = "3px";

                div.appendChild(subdiv);
              }

              var eventName = document.createElement("div");
              eventName.innerHTML = info.event.title;
              eventName.classList.add("mb");
              div.appendChild(eventName);
              var contrastColor = colorUtilsService.getReadableTextColor(
                info.backgroundColor,
                widgetFormat.event.fontColor
              );
              div.style.color = contrastColor;
              div.style.width = "100%";
              div.style.padding = "0px 3px";
              div.style.textAlign = widgetFormat.event.alignment;
              div.style.fontFamily = widgetFormat.event.fontFamily;

              info.el.lastElementChild.appendChild(div);
              info.el.style.marginBottom = "5px";
              if (
                info.event.extendedProps.location != undefined &&
                info.event.extendedProps.location.length > 1
              ) {
                info.el.style.removeProperty("border-color");
                info.el.style.removeProperty("background-color");
              }
            } else {
              info.el.style.textAlign = widgetFormat.event.alignment;
              info.el.style.fontFamily = widgetFormat.event.fontFamily;
              var contrastColor = colorUtilsService.getReadableTextColor(
                info.backgroundColor,
                widgetFormat.event.fontColor
              );
              info.el.style.color = contrastColor;
            }
          };
        } else {
          calendarBuildObject["eventDidMount"] = function (info) {
            if (info.el.childNodes.length > 0) {
              info.el.style.display = "flex";
              info.el.style.alignItems = "flex-start";

              var masterDiv = document.createElement("div");

              var imageUrl = info.event.extendedProps.imageUrl;
              if (imageUrl != undefined && imageUrl != null && imageUrl != "") {
                var imageDiv = document.createElement("div");
                imageDiv.style.padding = "2px";
                if (info.event.extendedProps.imageSize == "Small") {
                  imageDiv.style.height = "75px";
                } else if (info.event.extendedProps.imageSize == "Medium") {
                  imageDiv.style.height = "125px";
                } else if (info.event.extendedProps.imageSize == "Large") {
                  imageDiv.style.height = "175px";
                }

                var img = document.createElement("img");
                img.style.height = "100%";
                img.style.width = "100%";
                img.src = imageUrl;
                img.alt = "no access to image";
                img.style.objectFit = "100% 100%";
                imageDiv.appendChild(img);
                info.el.style.alignItems = "center";

                if (!info.event._def.allDay) {
                  info.el.firstElementChild.style.display = "none";
                  masterDiv.style.backgroundColor =
                    info.el.firstElementChild.style.borderColor;
                }
                masterDiv.appendChild(imageDiv);
              }

              var content = "";
              var eventDiv = document.createElement("div");

              if (format.isAllDayBlockColor) {
                info.el.style.background = info.backgroundColor;
              }
              for (var i = 0; i < info.el.childNodes.length; i++) {
                if (
                  !info.el.childNodes[i].classList.contains(
                    "fc-daygrid-event-dot"
                  ) ||
                  format.isAllDayBlockColor
                ) {
                  if (
                    info.el.childNodes[i].classList.contains("fc-event-time")
                  ) {
                	  if(format.showStartTime==true){
                		  var timeSpan = document.createElement("span");
                          timeSpan.style.fontWeight = "normal";
                          timeSpan.textContent = info.el.childNodes[i].textContent;
                          eventDiv.appendChild(timeSpan);	  
                	  }
                  } else {
                    masterDiv.classList.add("fc-event-title", wrap);
                    var textNode = document.createTextNode(
                      " " + info.el.childNodes[i].textContent
                    );
                    eventDiv.appendChild(textNode);
                  }
                  info.el.childNodes[i].style.display = "none";
                }
              }

              if (format.isAllDayBlockColor && !info.event._def.allDay) {
                masterDiv.style.padding = "1px";
              }
              masterDiv.appendChild(eventDiv);

              if (info.el.childNodes[0].classList.contains("fc-event-main")) {
                masterDiv.classList.add("fc-event-main");
              }

              if (info.event._def.allDay) {
                if (
                  info.backgroundColor != undefined &&
                  info.backgroundColor.trim().length > 2
                ) {
                  var readableTextColor =
                    colorUtilsService.getReadableTextColor(
                      info.backgroundColor,
                      widgetFormat.event.fontColor
                    );
                  masterDiv.style.color = readableTextColor;
                }
              } else {
                var imageUrl = info.event.extendedProps.imageUrl;
                if (
                  imageUrl != undefined &&
                  imageUrl != null &&
                  imageUrl != "" &&
                  !info.event._def.allDay &&
                  info.el.firstElementChild.style.borderColor != ""
                ) {
                  var readableTextColor =
                    colorUtilsService.getReadableTextColor(
                      info.el.firstElementChild.style.borderColor,
                      widgetFormat.event.fontColor
                    );
                  masterDiv.style.color = readableTextColor;
                } else {
                  if (format.isAllDayBlockColor) {
                    var readableTextColor =
                      colorUtilsService.getReadableTextColor(
                        info.backgroundColor,
                        widgetFormat.event.fontColor
                      );
                    masterDiv.style.color = readableTextColor;
                  } else {
                    masterDiv.style.color = widgetFormat.event.fontColor;
                  }
                }
              }

              masterDiv.style.width = "100%";
              masterDiv.style.textAlign = widgetFormat.event.alignment;
              masterDiv.style.fontFamily = widgetFormat.event.fontFamily;
              info.el.appendChild(masterDiv);
            }
          };
        }
      } else if (format.calendarType == "List") {
        calendarBuildObject["listDayFormat"] = {
          month: "long",
          day: "numeric",
          weekday: "long",
        };

        if (isHorizontalList) {
          calendarBuildObject.dayCellDidMount = function (info) {
            if (!uniqueDates.includes(info.el.dataset.date)) {
              info.el.style.display = "none";
              info.el.style.border = "none";
            } else {
              info.el.style.paddingLeft = "10px";
            }
          };
          calendarBuildObject.eventDidMount = function (info) {
            info.el.style.backgroundColor = "unset";
            info.el.style.border = "none";
            // remove default dot/time to fully control appearance
            var dot = info.el.querySelector(".fc-daygrid-event-dot");
            if (dot) dot.style.display = "none";

            var fcday = info.el.querySelector(".fc-day");
            if (fcday) dot.style.border = "none";

            var timeSpan = info.el.querySelector(".fc-event-time");
            if (timeSpan) timeSpan.style.display = "none";

            // main container inside the event
            var main = info.el.querySelector(".fc-event-main");
            info.el.style.marginTop = "10px";
            if (!main) main = info.el;
            main.innerHTML = ""; // clear default title/time

            // computed "bottomText" similar to list cell [0]
            var bottomText = info.timeText;
            if(bottomText!='all-day'){
            	bottomText = format.showStartTime==true?bottomText:"";
            }

            // Apply shared font prefs
            info.el.style.fontSize = widgetFormat.event.fontSize / 16 + "rem";
            info.el.style.fontFamily = widgetFormat.event.fontFamily;
            if (
              widgetFormat.event.fontColor &&
              widgetFormat.event.fontColor !== "default"
            ) {
              info.el.style.color = widgetFormat.event.fontColor;
            }
            info.el.classList.add(wrap);

            if (calendarwidget.contentType == "mealplan") {
              // --- MEALPLAN BRANCH (mirror of vertical) ---
              var div = document.createElement("div");
              div.style.display = "flex";
              div.style.alignItems = "center";

              // Image
              var imageUrl = info.event.extendedProps.imageUrl;
              if (imageUrl) {
                var img = document.createElement("img");
                img.src = imageUrl;
                img.alt = "image not accessible";
                if (format.image_size == "Small") {
                  img.height = 30;
                } else if (format.image_size == "Medium") {
                  img.height = 50;
                } else if (format.image_size == "Large") {
                  img.height = 80;
                }
                if (format.image_size != "Off") div.appendChild(img);
              }

              // Background via location mapping or event color
              if (info.event.extendedProps.location == "1") {
                div.classList.add("btn-success");
              } else if (info.event.extendedProps.location == "2") {
                div.classList.add("btn-info");
              } else if (info.event.extendedProps.location == "3") {
                div.classList.add("btn-danger");
              } else {
                div.style.backgroundColor = info.backgroundColor;
              }

              // Title text with contrast
              var eventName = document.createElement("div");
              eventName.style.margin = "0px 10px";
              eventName.style.width = "100%";
              eventName.style.textAlign = widgetFormat.event.alignment;
              var contrastColor = colorUtilsService.getReadableTextColor(
                info.backgroundColor,
                widgetFormat.event.fontColor
              );
              eventName.style.color = contrastColor;
              eventName.style.fontSize =
                widgetFormat.event.fontSize / 16 + "rem";
              eventName.style.fontFamily = widgetFormat.event.fontFamily;
              eventName.innerHTML = info.event.title;
              eventName.classList.add("mb", wrap);

              div.appendChild(eventName);
              main.appendChild(div);
            } else {
              // --- GENERAL BRANCH (mirror of vertical) ---
              var root = document.createElement("div");
              root.classList.add("verticle-element"); // keep same class names for consistency
              root.style.display = "flex";
              root.style.alignItems = "stretch";

              var leftbar = document.createElement("div");
              if (null != info.backgroundColor) {
                leftbar.style.border = "2.5px solid " + info.backgroundColor;
              } else {
                leftbar.style.border = "2.5px solid rgb(3, 125, 247)";
              }

              leftbar.style.borderRadius = "4px";
//              leftbar.style.marginRight = "10px";
              root.append(leftbar);

              var eventBar = document.createElement("div");
              eventBar.style.display = "flex";
              eventBar.style.alignItems = "center";
              eventBar.style.justifyContent = widgetFormat.event.alignment;
              eventBar.style.textAlign = widgetFormat.event.alignment;
              eventBar.style.width = "100%";

              var titleEl = document.createElement("div");
              titleEl.style.fontSize = widgetFormat.event.fontSize / 16 + "rem";
              titleEl.innerHTML = info.event.title;
              titleEl.classList.add("mb", wrap);
              titleEl.style.color = widgetFormat.event.fontColor;
              titleEl.style.fontFamily = widgetFormat.event.fontFamily;

              // Optional image
              var imageUrl2 = info.event.extendedProps.imageUrl;
              var imageDiv;
              if (imageUrl2) {
                imageDiv = document.createElement("div");
                if (bottomText != "all-day") imageDiv.classList.add("ml10");
                imageDiv.setAttribute("id", "img_div");
                if (info.event.extendedProps.imageSize == "Small")
                  imageDiv.style.height = "75px";
                else if (info.event.extendedProps.imageSize == "Medium")
                  imageDiv.style.height = "125px";
                else if (info.event.extendedProps.imageSize == "Large")
                  imageDiv.style.height = "175px";

                var img2 = document.createElement("img");
                img2.style.height = "100%";
                img2.src = imageUrl2;
                img2.alt = "no access to image";

                if (info.event.extendedProps.imageResolution == "Stretch") {
                  img2.style.objectFit = "100% 100%";
                } else if (info.event.extendedProps.imageResolution == "Crop") {
                  img2.style.objectFit = "cover";
                } else if (
                  info.event.extendedProps.imageResolution == "Default"
                ) {
                  img2.style.objectFit = "contain";
                } else {
                  img2.style.objectFit = "100% 100%";
                }

                imageDiv.appendChild(img2);
                eventBar.appendChild(imageDiv);
              }

              var subdiv = document.createElement("div");
              if (imageUrl2) subdiv.classList.add("ml10");

              subdiv.classList.add("subclass");
              if (format.isConcatEnabled == true) {
                // Title first
                subdiv.appendChild(titleEl);
                subdiv.classList.add("ml10");

                // Parent flex row with time + location
                var parentTitle = document.createElement("div");
                parentTitle.setAttribute("id", "parent");
                parentTitle.classList.add("flex");
                parentTitle.style.alignItems="flex-start";
                parentTitle.style.textAlign = widgetFormat.event.alignment;

                if (bottomText != "all-day" && bottomText != "") {
                  var timeEl = document.createElement("div");
                  timeEl.innerHTML = bottomText;
                  timeEl.classList.add("text-italic", "mb", "verticle-element", "cutome-time-size");
                  timeEl.style.flex = "0 0 auto";
                  timeEl.style.fontSize =
                    widgetFormat.event.fontSize / 16 + "rem";
                  timeEl.style.color = widgetFormat.event.fontColor;
                  timeEl.style.fontFamily = widgetFormat.event.fontFamily;
                  timeEl.classList.add("ml10");
                  parentTitle.appendChild(timeEl);
                }

                if (info.event.extendedProps.location) {
                  var locEl = document.createElement("div");
                  locEl.style.fontSize =
                    widgetFormat.event.fontSize / 16 + "rem";
                  locEl.innerHTML = info.event.extendedProps.location;
                  locEl.classList.add("text-italic", wrap);
                  locEl.style.color = widgetFormat.event.fontColor;
                  locEl.style.fontFamily = widgetFormat.event.fontFamily;
                  subdiv.appendChild(locEl);
                }

                parentTitle.appendChild(subdiv);
                eventBar.appendChild(parentTitle);
                root.appendChild(eventBar);
                main.appendChild(root);
                main.classList.add(wrap);
              } else {
                root.style.justifyContent = widgetFormat.event.alignment;
                root.style.textAlign = widgetFormat.event.alignment;
                // Non-concat: title + (time/location) as a second line
                titleEl.classList.add(wrap);
                subdiv.appendChild(titleEl);

                var combined = bottomText;
                if (info.event.extendedProps.location) {
                  if (bottomText == "all-day") {
                    combined = info.event.extendedProps.location;
                  } else {
                    combined =
                      bottomText + " , " + info.event.extendedProps.location;
                  }
                }

                if (combined != "all-day" && combined != "") {
                  var second = document.createElement("div");
                  second.innerHTML = combined;
                  second.style.fontSize =
                    widgetFormat.event.fontSize / 16 + "rem";
                  second.classList.add("text-italic", "mb", wrap);
                  second.style.color = widgetFormat.event.fontColor;
                  second.style.fontFamily = widgetFormat.event.fontFamily;
                  subdiv.appendChild(second);
                }
                eventBar.appendChild(subdiv);
                root.appendChild(eventBar);
                main.appendChild(root);
              }
            }
          };
        } else {
          calendarBuildObject["eventDidMount"] = function (info) {
            var fontSize = widgetFormat.event.fontSize / 16;
            var bg = "5px solid " + info.backgroundColor;
            info.el.cells[1].style.border = "none";
            info.el.cells[2].style.border = "none";
            info.el.cells[2].style.padding = "0px";
            info.el.style.justifyContent = widgetFormat.event.alignment;

            if (info.event.extendedProps.eventType == "reminder") {
              var p = document.createElement("p");
              p.classList.add("circle");
              p.classList.add("align-left");
              p.classList.add("reminder-dot");
              info.el.cells[2].prepend(p);
            }

            if (calendarwidget.contentType == "mealplan") {
              var parentdiv = document.createElement("div");
              parentdiv.style.display = "flex";
              parentdiv.style.justifyContent = widgetFormat.event.alignment;

              if (info.event.extendedProps.location == "1") {
                parentdiv.classList.add("btn-success");
              } else if (info.event.extendedProps.location == "2") {
                parentdiv.classList.add("btn-info");
              } else if (info.event.extendedProps.location == "3") {
                parentdiv.classList.add("btn-danger");
              } else {
            	  
            	  if(info.backgroundColor=="" || info.backgroundColor=="null" || info.backgroundColor==undefined){
            		  parentdiv.style.backgroundColor = "unset";	  
            	  }else{
            		  parentdiv.style.backgroundColor = info.backgroundColor;
            	  }
                
              }

              var div = document.createElement("div");
              div.style.display = "flex";
              div.style.alignItems = "center";
              var imageUrl = info.event.extendedProps.imageUrl;
              if (imageUrl != undefined && imageUrl != null && imageUrl != "") {
                var img = document.createElement("img");
                img.src = info.event.extendedProps.imageUrl;
                img.alt = "image not accessible";
                if (format.image_size == "Small") {
                  img.height = 30;
                } else if (format.image_size == "Medium") {
                  img.height = 50;
                } else if (format.image_size == "Large") {
                  img.height = 80;
                }
                if (format.image_size != "Off") {
                  div.appendChild(img);
                }
              }

              var eventName = document.createElement("div");
              eventName.style.margin = "0px 10px";
              eventName.style.width = "100%";
              var contrastColor = colorUtilsService.getReadableTextColor(
                info.backgroundColor,
                widgetFormat.event.fontColor
              );
              eventName.style.color = contrastColor;
              eventName.style.fontSize =
                widgetFormat.event.fontSize / 16 + "rem";
              eventName.style.fontFamily = widgetFormat.event.fontFamily;
              eventName.innerHTML = info.event.title;
              eventName.classList.add("mb", wrap);
              div.appendChild(eventName);
              parentdiv.appendChild(div);
              
              info.el.cells[1].style.display = "none";
              info.el.cells[2].appendChild(parentdiv);
            } else {
              var div = document.createElement("div");
              div.classList.add("verticle-element");

              var bottomText = info.el.cells[0].innerText;
              if(bottomText!='all-day'){
              	bottomText = format.showStartTime==true?bottomText:"";
              }
              var eventParent = document.createElement("div");
              eventParent.style.fontSize = fontSize + "rem";
              eventParent.innerHTML = info.event.title;
              eventParent.classList.add("mb", wrap);
              eventParent.style.color = widgetFormat.event.fontColor;
              eventParent.style.fontFamily = widgetFormat.event.fontFamily;

              var imageUrl = info.event.extendedProps.imageUrl;
              if (imageUrl != undefined && imageUrl != null && imageUrl != "") {
                var imageDiv = document.createElement("div");
                if (
                  info.el.cells[0].innerText != "all-day" &&
                  format.isConcatEnabled == true
                ) {
                  imageDiv.classList.add("ml10");
                }
                imageDiv.setAttribute("id", "img_div");
                if (info.event.extendedProps.imageSize == "Small") {
                  imageDiv.style.height = "75px";
                } else if (info.event.extendedProps.imageSize == "Medium") {
                  imageDiv.style.height = "125px";
                } else if (info.event.extendedProps.imageSize == "Large") {
                  imageDiv.style.height = "175px";
                }

                if (
                  imageUrl != undefined &&
                  imageUrl != null &&
                  imageUrl != ""
                ) {
                  var img = document.createElement("img");
                  img.style.height = "100%";
                  img.src = imageUrl;
                  img.alt = "no access to image";

                  if (info.event.extendedProps.imageResolution == "Stretch") {
                    img.style.objectFit = "100% 100%";
                  } else if (
                    info.event.extendedProps.imageResolution == "Crop"
                  ) {
                    img.style.objectFit = "cover";
                  } else if (
                    info.event.extendedProps.imageResolution == "Default"
                  ) {
                    img.style.objectFit = "contain";
                  } else {
                    img.style.objectFit = "100% 100%";
                  }

                  imageDiv.appendChild(img);
                  div.appendChild(imageDiv);
                }
              }

              if (imageUrl != undefined && imageUrl != null && imageUrl != "") {
                eventParent.classList.add("ml10");
              }
              if (format.isConcatEnabled == true) {
                var parentTitle = document.createElement("div");
                parentTitle.setAttribute("id", "parent");
                parentTitle.classList.add("flex");
                parentTitle.style.alignItems="flex-start";
                parentTitle.style.justifyContent = widgetFormat.event.alignment;
                parentTitle.style.textAlign = widgetFormat.event.alignment;

                if (info.el.cells[0].innerText != "all-day") {
                  var h5 = document.createElement("div");
                  h5.innerHTML = bottomText;
                  h5.classList.add("text-italic", "mb", "verticle-element", "cutome-time-size");
                  h5.style.flex = "0 0 auto";
                  h5.style.fontSize = fontSize + "rem";
                  h5.style.color = widgetFormat.event.fontColor;
                  h5.style.fontFamily = widgetFormat.event.fontFamily;
                  parentTitle.appendChild(h5);
                }

                if (info.el.cells[0].innerText != "all-day") {
                	if(format.showStartTime==true){
                		eventParent.classList.add("ml10");	
                	}
                }

                if (info.event.extendedProps.location != "") {
                  var h5 = document.createElement("div");
                  h5.style.fontSize = fontSize + "rem";
                  h5.innerHTML = info.event.extendedProps.location;
                  h5.classList.add("text-italic", wrap);
                  h5.style.fontSize = fontSize + "rem";
                  h5.style.color = widgetFormat.event.fontColor;
                  h5.style.fontFamily = widgetFormat.event.fontFamily;
                  eventParent.appendChild(h5);
                }

                div.appendChild(eventParent);
                parentTitle.appendChild(div);
                info.el.cells[2].appendChild(parentTitle);
                info.el.cells[2].classList.add(wrap);
              } else {
                div.style.justifyContent = widgetFormat.event.alignment;
                div.style.textAlign = widgetFormat.event.alignment;
                eventParent.classList.add(wrap);

                if (info.event.extendedProps.location != "") {
                  if (info.el.cells[0].innerText == "all-day") {
                    bottomText = info.event.extendedProps.location;
                  } else {
                    bottomText =
                      bottomText + " , " + info.event.extendedProps.location;
                  }
                }

                if (bottomText != "all-day" && bottomText != "") {
                  var h5 = document.createElement("div");
                  h5.innerHTML = bottomText;
                  h5.style.fontSize = fontSize + "rem";
                  h5.classList.add("text-italic", "mb", wrap);
                  h5.style.color = widgetFormat.event.fontColor;
                  h5.style.fontFamily = widgetFormat.event.fontFamily;
                  eventParent.appendChild(h5);
                }

                div.appendChild(eventParent);
                info.el.cells[2].appendChild(div);
              }
            }

            var dotEl = info.el.getElementsByClassName(
              "fc-list-event-graphic"
            )[0];
            if (dotEl) {
              dotEl.style.borderRight = bg;
              dotEl.style.borderRadius = "2px";
            }
          };
        }
      } else if (
        format.calendarType == "Monthly" ||
        isYearlyGridMultiMonthView ||
        isYearlyTimelineView
      ) {
        calendarBuildObject["initialDate"] = defaultStartDate;
        calendarBuildObject["displayEventTime"] = true;
        if(
          (format.calendarType == "Monthly" &&
            format.isMultiMonthView == true &&
            !isContinuousMultiMonthView) ||
          isYearlyGridMultiMonthView
        ){
        	calendarBuildObject["showNonCurrentDates"] = false;
	  	}else{
	  		calendarBuildObject["showNonCurrentDates"] = true;  
	  	}
        
        calendarBuildObject["dayMaxEvents"] = true;

        if (calendarwidget.contentType == "calendar") {
          calendarBuildObject["eventDidMount"] = function (info) {
            if (info.el.childNodes.length > 0) {
              info.el.style.display = "flex";
              info.el.style.alignItems = "flex-start";

              var masterDiv = document.createElement("div");
              masterDiv.style.width = "100%";
              if (format.isFillDayWithFirstPhotoOnly == false) {
                var imageUrl = info.event.extendedProps.imageUrl;
                if (
                  imageUrl != undefined &&
                  imageUrl != null &&
                  imageUrl != ""
                ) {
                  var imageDiv = document.createElement("div");
                  imageDiv.style.padding = "2px";
                  if (info.event.extendedProps.imageSize == "Small") {
                    imageDiv.style.height = "75px";
                  } else if (info.event.extendedProps.imageSize == "Medium") {
                    imageDiv.style.height = "125px";
                  } else if (info.event.extendedProps.imageSize == "Large") {
                    imageDiv.style.height = "175px";
                  }

                  var img = document.createElement("img");
                  img.style.height = "100%";
                  img.style.width = "100%";
                  img.src = imageUrl;
                  img.alt = "no access to image";
                  img.style.objectFit = "100% 100%";
                  imageDiv.appendChild(img);

                  if (!info.event._def.allDay) {
                    info.el.firstElementChild.style.display = "none";
                    masterDiv.style.backgroundColor =
                      info.el.firstElementChild.style.borderColor;
                  }
                  masterDiv.appendChild(imageDiv);
                  info.el.style.alignItems = "center";
                }
              }

              var eventDiv = document.createElement("div");
              var content = "";
              if (format.isAllDayBlockColor) {
                info.el.style.background = info.backgroundColor;
              }
              for (var i = 0; i < info.el.childNodes.length; i++) {
                if (
                  !info.el.childNodes[i].classList.contains(
                    "fc-daygrid-event-dot"
                  ) ||
                  format.isAllDayBlockColor
                ) {
                  if (
                    info.el.childNodes[i].classList.contains("fc-event-time")
                  ) {
                	  if(format.showStartTime==true){
                		  var timeSpan = document.createElement("span");
                          timeSpan.style.fontWeight = "normal";
                          timeSpan.textContent = info.el.childNodes[i].textContent;
                          eventDiv.appendChild(timeSpan);	  
                	  }
                  } else {
                    masterDiv.classList.add("fc-event-title", wrap);
                    var textNode = document.createTextNode(
                      " " + info.el.childNodes[i].textContent
                    );
                    eventDiv.appendChild(textNode);
                  }
                  info.el.childNodes[i].style.display = "none";
                }
              }

              if (format.isAllDayBlockColor && !info.event._def.allDay) {
                masterDiv.style.padding = "1px";
              }
              masterDiv.appendChild(eventDiv);

              if (info.el.childNodes[0].classList.contains("fc-event-main")) {
                masterDiv.classList.add("fc-event-main");
              }

              if (info.event._def.allDay) {
                if (
                  info.backgroundColor != undefined &&
                  info.backgroundColor.trim().length > 2
                ) {
                  var readableTextColor =
                    colorUtilsService.getReadableTextColor(
                      info.backgroundColor,
                      widgetFormat.event.fontColor
                    );
                  masterDiv.style.color = readableTextColor;
                }
              } else {
                var imageUrl = info.event.extendedProps.imageUrl;
                if (
                  imageUrl != undefined &&
                  imageUrl != null &&
                  imageUrl != "" &&
                  !info.event._def.allDay &&
                  info.el.firstElementChild.style.borderColor != ""
                ) {
                  var readableTextColor =
                    colorUtilsService.getReadableTextColor(
                      info.el.firstElementChild.style.borderColor,
                      widgetFormat.event.fontColor
                    );
                  masterDiv.style.color = readableTextColor;
                } else {
                  if (format.isAllDayBlockColor) {
                    var readableTextColor =
                      colorUtilsService.getReadableTextColor(
                        info.backgroundColor,
                        widgetFormat.event.fontColor
                      );
                    masterDiv.style.color = readableTextColor;
                  } else {
                    masterDiv.style.color = widgetFormat.event.fontColor;
                  }
                }
              }

              eventDiv.style.width = "100%";
              eventDiv.style.textAlign = widgetFormat.event.alignment;
              eventDiv.style.fontFamily = widgetFormat.event.fontFamily;
              info.el.appendChild(masterDiv);
            }
          };
        }

        var monthLikeScroll =
          format.calendarType == "Yearly"
            ? format.y_scroll || "Off"
            : format.m_scroll || "Off";
        if (monthLikeScroll !== "Fast" && monthLikeScroll !== "Slow") {
          if (format.y_scroll == "Fast" || format.y_scroll == "Slow") {
            monthLikeScroll = format.y_scroll;
          } else if (format.m_scroll == "Fast" || format.m_scroll == "Slow") {
            monthLikeScroll = format.m_scroll;
          }
        }
        var shouldForceMoreLinkCallbackAfterCompression =
          isYearlyTimelineView || isContinuousMultiMonthView;
        var isSelectedMultiMonthForMoreLink =
          (format.calendarType == "Monthly" ||
            format.calendarType == "Yearly") &&
          selectedMonthsCount > 1;
        var moreLinkCompressionTimer = null;
        var moreLinkReapplyTimers = [];
        var resolveDayCellFromNode = function (node) {
          if (!node) return null;
          if (node.closest) {
            var closestDayCell = node.closest("td.fc-daygrid-day, td[data-date]");
            if (closestDayCell) return closestDayCell;
          }
          var parentNode = node.parentElement;
          while (parentNode) {
            if (
              parentNode.tagName === "TD" &&
              (parentNode.classList.contains("fc-daygrid-day") ||
                parentNode.getAttribute("data-date"))
            ) {
              return parentNode;
            }
            parentNode = parentNode.parentElement;
          }
          return null;
        };

        var applyMoreLinkScrollBehaviorToDayCell = function (dayCell) {
          if (!dayCell) return false;
          if (!(monthLikeScroll == "Fast" || monthLikeScroll == "Slow")) {
            return false;
          }
          if (dayCell.getAttribute("data-mm-scroll-bound") === "1") {
            return false;
          }
          dayCell.setAttribute("data-mm-scroll-bound", "1");

          $timeout(function () {
            var scrollOption = {
              isMultiMonth: isSelectedMultiMonthForMoreLink,
              scrolling: monthLikeScroll,
              parentClass: "fc-daygrid-day-events",
              childClass: "fc-daygrid-event-harness",
              padding: 20,
              id: "calendar_" + widgetSettingId,
              widgetType: isYearlyGridMultiMonthView
                ? "Monthly"
                : format.calendarType,
            };
            $scope.checkAndUpdateRootScope(scrollOption);
            $(dayCell).attr("mango-mirror-scroll", angular.toJson(scrollOption));
            $compile(angular.element(dayCell))($scope);
          }, 300);
          return true;
        };

        var applyMoreLinkScrollBehavior = function (moreLinkEl) {
          if (
            !moreLinkEl ||
            !(monthLikeScroll == "Fast" || monthLikeScroll == "Slow")
          ) {
            return;
          }
          moreLinkEl.style.display = "none";
          var dayCell = resolveDayCellFromNode(moreLinkEl);
          applyMoreLinkScrollBehaviorToDayCell(dayCell);
        };

        var applyOverflowScrollFallbackWithoutMoreLink = function () {
          if (
            !calendarEl ||
            !(monthLikeScroll == "Fast" || monthLikeScroll == "Slow")
          ) {
            return 0;
          }
          var appliedCount = 0;
          var dayCells = calendarEl.querySelectorAll("td.fc-daygrid-day, td[data-date]");
          Array.prototype.forEach.call(dayCells, function (dayCell) {
            if (!dayCell || !dayCell.querySelector) return;
            if (dayCell.querySelector(".fc-daygrid-more-link")) return;

            var eventsContainer = dayCell.querySelector(".fc-daygrid-day-events");
            if (!eventsContainer) return;
            var harnesses = eventsContainer.querySelectorAll(
              ".fc-daygrid-event-harness"
            );
            if (!harnesses || harnesses.length === 0) return;

            var availableHeight = eventsContainer.clientHeight;
            if (!availableHeight || availableHeight <= 0) return;

            var contentBottom = 0;
            Array.prototype.forEach.call(harnesses, function (harnessEl) {
              var harnessBottom = harnessEl.offsetTop + harnessEl.offsetHeight;
              if (harnessBottom > contentBottom) {
                contentBottom = harnessBottom;
              }
            });

            var isOverflowing =
              contentBottom > availableHeight + 1 ||
              eventsContainer.scrollHeight > availableHeight + 1;
            if (!isOverflowing) return;

            if (applyMoreLinkScrollBehaviorToDayCell(dayCell)) {
              appliedCount++;
            }
          });
          return appliedCount;
        };

        var dispatchMoreLinkDidMountForCurrentLinks = function (syntheticFlag) {
          if (!calendarEl) return 0;
          var moreLinkEls = calendarEl.querySelectorAll(".fc-daygrid-more-link");
          Array.prototype.forEach.call(moreLinkEls, function (moreLinkEl) {
            if (typeof calendarBuildObject["moreLinkDidMount"] === "function") {
              calendarBuildObject["moreLinkDidMount"]({
                el: moreLinkEl,
                isSynthetic: syntheticFlag === true,
              });
            } else {
              applyMoreLinkScrollBehavior(moreLinkEl);
            }
          });
          return moreLinkEls.length;
        };

        var clearQueuedMoreLinkReapplyTimers = function () {
          if (!moreLinkReapplyTimers || moreLinkReapplyTimers.length === 0) {
            return;
          }
          for (var timerIdx = 0; timerIdx < moreLinkReapplyTimers.length; timerIdx++) {
            $timeout.cancel(moreLinkReapplyTimers[timerIdx]);
          }
          moreLinkReapplyTimers = [];
        };

        var queueMoreLinkReapplyAfterCompression = function () {
          if (
            !shouldForceMoreLinkCallbackAfterCompression ||
            !(monthLikeScroll == "Fast" || monthLikeScroll == "Slow")
          ) {
            return;
          }
          if (moreLinkCompressionTimer) {
            $timeout.cancel(moreLinkCompressionTimer);
          }
          clearQueuedMoreLinkReapplyTimers();
          var runMoreLinkPostCompressionPass = function () {
            dispatchMoreLinkDidMountForCurrentLinks(true);
            applyOverflowScrollFallbackWithoutMoreLink();
          };
          moreLinkCompressionTimer = $timeout(function () {
            runMoreLinkPostCompressionPass();
            moreLinkReapplyTimers.push(
              $timeout(function () {
                runMoreLinkPostCompressionPass();
              }, 180)
            );
            moreLinkReapplyTimers.push(
              $timeout(function () {
                runMoreLinkPostCompressionPass();
              }, 520)
            );
          }, 80);
        };

        calendarBuildObject["moreLinkDidMount"] = function (arg) {
          var moreLinkEl = arg ? arg.el : null;
          applyMoreLinkScrollBehavior(moreLinkEl);
        };

        if (format.m_weeksToShow == 1) {
          calendarBuildObject["fixedWeekCount"] = false;
        } else if (format.m_weeksToShow == 2) {
          calendarBuildObject["fixedWeekCount"] = true;
        }

        calendarBuildObject["dayCellDidMount"] = function (arg) {
          if (
            format.calendarType == "Monthly" ||
            isYearlyGridMultiMonthView ||
            isYearlyTimelineView
          ) {
            var date = arg.date.getDate() + "-" + arg.date.getMonth();

            applyCalendarDateAlignment(arg.el.firstChild.firstChild);
            if (widgetFormat.date.fontColor == "default") {
              arg.el.firstChild.firstChild.firstChild.style.color = "unset";
            } else {
              arg.el.firstChild.firstChild.firstChild.style.color =
                widgetFormat.date.fontColor;
            }
            if (
              shouldApplyWeekendTitleColorForTimelineViews &&
              resolvedWeekendTitleColor
            ) {
              var cellDayOfWeek = arg.date.getDay();
              if (cellDayOfWeek === 0 || cellDayOfWeek === 6) {
                arg.el.firstChild.firstChild.firstChild.style.color =
                  resolvedWeekendTitleColor;
              }
            }

            arg.el.firstChild.firstChild.style.fontFamily =
              widgetFormat.date.fontFamily;
            arg.el.firstChild.firstChild.style.fontSize =
              widgetFormat.date.fontSize / 16 + "em";
            if(arg.isDisabled==false){
            	applyCalendarWeatherOverlay(arg);	
            }
            if (format.isFillDayWithFirstPhotoOnly == true && arg.isOther==false) {
              var image = isImageExist(date, eventList);
              if (image != null && image != "") {
                var eventNode = arg.el.childNodes[0];
                if (eventNode.childNodes.length > 1) {
                  eventNode.childNodes[1].style.display = "none";
                }
                $scope
                  .checkImage(image.imageUrl)
                  .then(function (isImageAccessible) {
                    if (isImageAccessible) {
                      arg.el.style.background = "url(" + image.imageUrl + ")";
                    } else {
                      arg.el.style.background =
                        "url('images/image_not_access.png')";
                    }

                    if (image.imageResolution == "Stretch") {
                      arg.el.style.backgroundSize = "100% 100%";
                    } else if (image.imageResolution == "Crop") {
                      arg.el.style.backgroundSize = "cover";
                    } else if (image.imageResolution == "Default") {
                      arg.el.style.backgroundSize = "contain";
                    } else {
                      arg.el.style.backgroundSize = "100% 100%";
                    }
                    arg.el.style.backgroundRepeat = "no-repeat";
                    arg.el.style.backgroundPosition = "center";
                  })
                  .catch(function (error) {
                    console.error("Error loading image:", error);
                  });
              }
            }
          }
        };
      }

      var bindDirectClickForYearlyStrip = function (info) {
        if (!isYearlyStripRender || !info || !info.el) return;
        if (info.el.getAttribute("data-mm-strip-click-bound") === "1") return;
        info.el.setAttribute("data-mm-strip-click-bound", "1");
        info.el.style.cursor = "pointer";
        info.el.addEventListener("click", function (event) {
          if (event) {
            event.preventDefault();
            event.stopPropagation();
          }
          $scope.$applyAsync(function () {
            handleCalendarEventClick({
              event: info.event,
              el: info.el,
              jsEvent: event,
              view: info.view,
            });
          });
        });
      };

      if (isYearlyStripRender) {
        var originalEventDidMount = calendarBuildObject["eventDidMount"];
        calendarBuildObject["eventDidMount"] = function (info) {
          if (typeof originalEventDidMount === "function") {
            originalEventDidMount(info);
          }
          bindDirectClickForYearlyStrip(info);
        };
      }

      var fullcalendarId = "";
      if (calendarwidget.contentType == "mealplan") {
        fullcalendarId = "mealplan_" + widgetSettingId;
      } else if (calendarwidget.contentType == "calendar") {
        fullcalendarId = "calendar_" + widgetSettingId;
      }

      try {
        $scope.clearRenderObject(fullcalendarId);
        var calendarEl = document.getElementById(
          fullcalendarId + "_" + $scope.quoteIndex
        );
        if (calendarEl.childNodes.length > 0) {
          calendarEl.removeChild(calendarEl.children[0]);
        }

        calendarEl = document.getElementById(
          fullcalendarId + "_" + $scope.quoteIndex
        );

        var calDivHeight = widgetHeight - 5;
        if (widgetBackgroundSetting.isNameVisible == true) {
          var widgetTitleFormat = JSON.parse(
            widgetBackgroundSetting.widgetTitleFormat
          );
          calDivHeight = calDivHeight - widgetTitleFormat.fontSize * 1.5;
        }
        calendarEl.style.height = calDivHeight + "px";

        $timeout(function () {
          calendarEl = document.getElementById(
            fullcalendarId + "_" + $scope.quoteIndex
          );
          calendar_render_object = new FullCalendar.Calendar(
            calendarEl,
            calendarBuildObject
          );
          calendar_render_object.render();
          $scope.fullCalendarMap[fullcalendarId + "_" + $scope.quoteIndex] =
            calendar_render_object;

          if (
            (format.calendarType == "Monthly" &&
              format.isMultiMonthView == true &&
              isContinuousMultiMonthView) ||
            isYearlyTimelineView
          ) {
            var applyContinuousCompression = function () {
              var continuousBodyScroller =
                calendarEl.querySelector(".fc-scrollgrid-section-body .fc-scroller") ||
                calendarEl.querySelector(".fc-scroller-harness .fc-scroller");
              var continuousScrollerHarness = continuousBodyScroller
                ? continuousBodyScroller.parentElement
                : null;
              var continuousDayGridBody = calendarEl.querySelector(".fc-daygrid-body");
              var continuousDayGridTable = continuousDayGridBody
                ? continuousDayGridBody.querySelector("table")
                : null;
              var continuousWeekRows = continuousDayGridTable
                ? continuousDayGridTable.querySelectorAll("tbody tr")
                : [];

              if (
                !continuousBodyScroller ||
                !continuousDayGridBody ||
                !continuousDayGridTable ||
                continuousWeekRows.length <= 0
              ) {
                return;
              }

              if (shouldApplyContinuousWeekPacking) {
                var minCellWidth = 100;
                var visibleDaysPerWeek = isWeekdaysOnly ? 5 : 7;
                var availableTimelineWidth = continuousDayGridBody.clientWidth;
                if (!availableTimelineWidth || availableTimelineWidth <= 0) {
                  availableTimelineWidth =
                    continuousDayGridTable.clientWidth ||
                    calendarEl.clientWidth ||
                    widgetWidth;
                }
                var maxDayColumns = Math.max(
                  visibleDaysPerWeek,
                  Math.floor(availableTimelineWidth / minCellWidth)
                );
                var weeksPerRow = Math.max(
                  1,
                  Math.floor(maxDayColumns / visibleDaysPerWeek)
                );
                var expectedDayColumns = visibleDaysPerWeek * weeksPerRow;

                var expandColgroupToWeekBlocks = function (tableEl, blockCount) {
                  if (!tableEl) return;
                  var colgroupEl = tableEl.querySelector("colgroup");
                  if (!colgroupEl) return;
                  var cols = Array.prototype.slice.call(colgroupEl.children);
                  if (cols.length === visibleDaysPerWeek * blockCount) return;
                  var baseCols = cols.slice(0, visibleDaysPerWeek);
                  if (baseCols.length !== visibleDaysPerWeek) return;
                  colgroupEl.innerHTML = "";
                  var perColWidth =
                    (100 / (visibleDaysPerWeek * blockCount)).toFixed(6) + "%";
                  for (var bi = 0; bi < blockCount; bi++) {
                    for (var ci = 0; ci < baseCols.length; ci++) {
                      var newCol = baseCols[ci].cloneNode(true);
                      newCol.style.width = perColWidth;
                      colgroupEl.appendChild(newCol);
                    }
                  }
                };

                var expandHeaderToWeekBlocks = function (tableEl, blockCount) {
                  if (!tableEl) return;
                  var headerRow = tableEl.querySelector("thead tr");
                  if (!headerRow) return;
                  var headerCells = Array.prototype.slice.call(
                    headerRow.children
                  );
                  var baseHeaderCells = headerCells.slice(0, visibleDaysPerWeek);
                  if (baseHeaderCells.length !== visibleDaysPerWeek) return;

                  // Keep weekday labels per packed day column (not grouped once).
                  if (headerCells.length !== visibleDaysPerWeek * blockCount) {
                    headerRow.innerHTML = "";
                    for (var hb = 0; hb < blockCount; hb++) {
                      for (var hi = 0; hi < baseHeaderCells.length; hi++) {
                        var clonedHeader = baseHeaderCells[hi].cloneNode(true);
                        if (clonedHeader.id) {
                          clonedHeader.removeAttribute("id");
                        }
                        clonedHeader.colSpan = 1;
                        clonedHeader.style.minWidth = minCellWidth + "px";
                        headerRow.appendChild(clonedHeader);
                      }
                    }
                  } else {
                    for (var hc = 0; hc < headerCells.length; hc++) {
                      headerCells[hc].colSpan = 1;
                      headerCells[hc].style.minWidth = minCellWidth + "px";
                    }
                  }
                };

                var syncHeaderToBodyColumns = function (headerTableEl, bodyTableEl) {
                  if (!headerTableEl || !bodyTableEl) return;
                  var headerRow = headerTableEl.querySelector("thead tr");
                  var firstBodyRow = bodyTableEl.querySelector("tbody tr");
                  if (!headerRow || !firstBodyRow) return;

                  var bodyCells = Array.prototype.slice.call(
                    firstBodyRow.querySelectorAll("td.fc-daygrid-day")
                  );
                  if (!bodyCells.length) return;

                  var existingHeaderCells = Array.prototype.slice.call(
                    headerRow.children
                  );
                  var baseHeaderCells = existingHeaderCells.slice(
                    0,
                    visibleDaysPerWeek
                  );
                  if (!baseHeaderCells.length && existingHeaderCells.length) {
                    baseHeaderCells = [existingHeaderCells[0]];
                  }
                  if (!baseHeaderCells.length) return;

                  var desiredColumns = bodyCells.length;
                  var rebuiltHeaders = [];
                  var perHeaderWidth = (100 / desiredColumns).toFixed(6) + "%";

                  for (var hci = 0; hci < desiredColumns; hci++) {
                    var templateHeader = baseHeaderCells[hci % baseHeaderCells.length];
                    var headerCell = templateHeader.cloneNode(true);
                    if (headerCell.id) {
                      headerCell.removeAttribute("id");
                    }
                    headerCell.colSpan = 1;
                    headerCell.style.minWidth = minCellWidth + "px";
                    headerCell.style.width = perHeaderWidth;

                    var dayDateText = bodyCells[hci].getAttribute("data-date");
                    var weekdayText = "";
                    if (dayDateText) {
                      var weekdayDate = new Date(dayDateText + "T00:00:00");
                      if (!isNaN(weekdayDate.getTime())) {
                        weekdayText = weekdayDate.toLocaleDateString(
                          language || "en",
                          { weekday: "short" }
                        );
                      }
                    }

                    var cushion = headerCell.querySelector(
                      ".fc-col-header-cell-cushion"
                    );
                    if (!cushion) {
                      var syncInner = headerCell.querySelector(
                        ".fc-scrollgrid-sync-inner"
                      );
                      if (!syncInner) {
                        syncInner = document.createElement("div");
                        syncInner.className = "fc-scrollgrid-sync-inner";
                        headerCell.innerHTML = "";
                        headerCell.appendChild(syncInner);
                      }
                      cushion = document.createElement("a");
                      cushion.className = "fc-col-header-cell-cushion";
                      syncInner.innerHTML = "";
                      syncInner.appendChild(cushion);
                    }
                    if (weekdayText) {
                      cushion.textContent = weekdayText;
                      headerCell.setAttribute("aria-label", weekdayText);
                    }
                    rebuiltHeaders.push(headerCell);
                  }

                  headerRow.innerHTML = "";
                  for (var rh = 0; rh < rebuiltHeaders.length; rh++) {
                    headerRow.appendChild(rebuiltHeaders[rh]);
                  }
                };

                var headerTable =
                  calendarEl.querySelector(".fc-col-header table") ||
                  calendarEl.querySelector(
                    ".fc-scrollgrid-section-header table"
                  ) ||
                  calendarEl.querySelector("table.fc-col-header");
                expandColgroupToWeekBlocks(continuousDayGridTable, weeksPerRow);
                expandColgroupToWeekBlocks(headerTable, weeksPerRow);
                expandHeaderToWeekBlocks(headerTable, weeksPerRow);

                var bodyTbody = continuousDayGridTable.querySelector("tbody");
                var allDayCells = bodyTbody
                  ? Array.prototype.slice
                      .call(bodyTbody.querySelectorAll("td.fc-daygrid-day"))
                      .filter(function (cell) {
                        return (
                          cell.getAttribute("data-fc-week-filler") !== "true"
                        );
                      })
                  : [];

                if (bodyTbody && allDayCells.length > 0) {
                  var firstRow = bodyTbody.querySelector("tr");
                  var currentColumns = firstRow ? firstRow.children.length : 0;
                  if (
                    currentColumns !== expectedDayColumns ||
                    continuousDayGridTable.getAttribute("data-weeks-per-row") !=
                      String(weeksPerRow)
                  ) {
                    var rebuiltRows = [];
                    for (
                      var cellStart = 0;
                      cellStart < allDayCells.length;
                      cellStart += expectedDayColumns
                    ) {
                      var rebuiltRow = document.createElement("tr");
                      rebuiltRow.setAttribute("role", "row");
                      var rowCells = allDayCells.slice(
                        cellStart,
                        cellStart + expectedDayColumns
                      );
                      for (var rc = 0; rc < rowCells.length; rc++) {
                        rowCells[rc].removeAttribute("data-fc-week-filler");
                        rebuiltRow.appendChild(rowCells[rc]);
                      }
                      for (var pad = rowCells.length; pad < expectedDayColumns; pad++) {
                        var fillerCell = document.createElement("td");
                        fillerCell.className =
                          "fc-daygrid-day fc-day fc-day-other";
                        fillerCell.setAttribute("role", "gridcell");
                        fillerCell.setAttribute("data-fc-week-filler", "true");
                        fillerCell.style.visibility = "hidden";
                        fillerCell.style.pointerEvents = "none";
                        fillerCell.style.minWidth = minCellWidth + "px";
                        rebuiltRow.appendChild(fillerCell);
                      }
                      rebuiltRows.push(rebuiltRow);
                    }

                    bodyTbody.innerHTML = "";
                    for (var rr = 0; rr < rebuiltRows.length; rr++) {
                      bodyTbody.appendChild(rebuiltRows[rr]);
                    }
                  }
                }

                syncHeaderToBodyColumns(headerTable, continuousDayGridTable);

                continuousDayGridTable.setAttribute(
                  "data-weeks-per-row",
                  String(weeksPerRow)
                );

                continuousWeekRows = continuousDayGridTable
                  ? continuousDayGridTable.querySelectorAll("tbody tr")
                  : [];
                if (!continuousWeekRows || continuousWeekRows.length <= 0) {
                  return;
                }
              }

              var continuousViewHarness = calendarEl.querySelector(
                ".fc-view-harness.fc-view-harness-active"
              );
              var continuousColHeader = calendarEl.querySelector(".fc-col-header");
              var continuousViewHeight = continuousViewHarness
                ? continuousViewHarness.clientHeight
                : calHeight;
              var continuousHeaderHeight = continuousColHeader
                ? continuousColHeader.offsetHeight
                : 0;
              var continuousAvailableHeight = Math.max(
                1,
                Math.floor(continuousViewHeight - continuousHeaderHeight - 2)
              );

              if (
                continuousBodyScroller.clientHeight > 0 &&
                continuousBodyScroller.clientHeight < continuousAvailableHeight &&
                !shouldApplyYearlyTimelineWeekPacking
              ) {
                continuousAvailableHeight = continuousBodyScroller.clientHeight;
              }

              var scrollerComputedStyle = window.getComputedStyle(
                continuousBodyScroller
              );
              var scrollerPaddingY =
                (parseFloat(scrollerComputedStyle.paddingTop) || 0) +
                (parseFloat(scrollerComputedStyle.paddingBottom) || 0);
              if (!shouldApplyYearlyTimelineWeekPacking) {
                continuousAvailableHeight = Math.max(
                  1,
                  Math.floor(continuousAvailableHeight - scrollerPaddingY)
                );
              } else {
                continuousAvailableHeight = Math.max(
                  1,
                  Math.floor(continuousAvailableHeight)
                );
              }

              var firstContinuousRowCell = continuousWeekRows[0].querySelector("td");
              var perRowBorder = 0;
              if (firstContinuousRowCell) {
                var firstCellComputedStyle = window.getComputedStyle(
                  firstContinuousRowCell
                );
                perRowBorder =
                  (parseFloat(firstCellComputedStyle.borderTopWidth) || 0) +
                  (parseFloat(firstCellComputedStyle.borderBottomWidth) || 0);
              }
              var totalBorderHeight = Math.ceil(
                perRowBorder * continuousWeekRows.length
              );
              var usableRowHeight = Math.max(
                continuousWeekRows.length,
                continuousAvailableHeight - totalBorderHeight
              );
              var minDateSectionHeight =
                Math.ceil(widgetFormat.date.fontSize / 16) + 8;
              var minEventAreaHeight = shouldApplyContinuousWeekPacking
                ? 50
                : 0;
              var minRowHeight = minDateSectionHeight + minEventAreaHeight;
              var targetUsableRowHeight = Math.max(
                usableRowHeight,
                minRowHeight * continuousWeekRows.length
              );
              var baseContinuousRowHeight = Math.floor(
                targetUsableRowHeight / continuousWeekRows.length
              );
              var lastContinuousRowHeight =
                targetUsableRowHeight -
                baseContinuousRowHeight * (continuousWeekRows.length - 1);
              var targetTableHeight = shouldApplyContinuousWeekPacking
                ? Math.max(
                    continuousAvailableHeight,
                    targetUsableRowHeight + totalBorderHeight
                  )
                : continuousAvailableHeight;
              var effectiveVisibleContinuousHeight = continuousAvailableHeight;
              if (shouldApplyContinuousWeekPacking) {
                var consumedVisibleHeight = 0;
                var maxFullRowsVisible = 0;
                for (
                  var visibleRowIdx = 0;
                  visibleRowIdx < continuousWeekRows.length;
                  visibleRowIdx++
                ) {
                  var plannedRowHeight =
                    visibleRowIdx === continuousWeekRows.length - 1
                      ? lastContinuousRowHeight
                      : baseContinuousRowHeight;
                  var plannedRowTotalHeight = plannedRowHeight + perRowBorder;
                  if (
                    consumedVisibleHeight + plannedRowTotalHeight >
                    continuousAvailableHeight + 0.5
                  ) {
                    break;
                  }
                  consumedVisibleHeight += plannedRowTotalHeight;
                  maxFullRowsVisible++;
                }

                if (maxFullRowsVisible <= 0) {
                  maxFullRowsVisible = 1;
                  consumedVisibleHeight =
                    baseContinuousRowHeight + perRowBorder;
                }

                // For monthly continuous view, keep the full viewport height and
                // allow vertical scrolling. Restricting to full-row height here
                // causes a large empty gap above legends on shorter widgets.
                if (
                  shouldApplyYearlyTimelineWeekPacking &&
                  maxFullRowsVisible < continuousWeekRows.length
                ) {
                  effectiveVisibleContinuousHeight = Math.max(
                    1,
                    Math.min(
                      continuousAvailableHeight,
                      Math.floor(consumedVisibleHeight)
                    )
                  );
                }
              }
              var shouldHideNonFittingTimelineRows =
                shouldApplyYearlyTimelineWeekPacking;
              var shouldEnableContinuousVerticalScroll =
                shouldApplyContinuousWeekPacking &&
                targetTableHeight > effectiveVisibleContinuousHeight + 1;
              if (shouldHideNonFittingTimelineRows) {
                // Yearly timeline must not show clipped bottom rows.
                shouldEnableContinuousVerticalScroll = false;
                // Keep viewport at the true available height, then hide any
                // trailing rows that do not fully fit after final row sizing.
                effectiveVisibleContinuousHeight = continuousAvailableHeight;
                targetTableHeight = continuousAvailableHeight;
              }

              continuousBodyScroller.style.overflowY =
                shouldEnableContinuousVerticalScroll
                ? "auto"
                : "hidden";
              continuousBodyScroller.style.overflowX = "hidden";
              if (
                continuousScrollerHarness &&
                continuousScrollerHarness.classList.contains("fc-scroller-harness")
              ) {
                continuousScrollerHarness.style.height =
                  effectiveVisibleContinuousHeight + "px";
              }
              continuousBodyScroller.style.height =
                effectiveVisibleContinuousHeight + "px";
              continuousDayGridBody.style.height =
                effectiveVisibleContinuousHeight + "px";
              continuousDayGridTable.style.height = targetTableHeight + "px";

              Array.prototype.forEach.call(
                continuousWeekRows,
                function (rowEl, rowIndex) {
                  rowEl.style.display = "";
                  var rowHeight =
                    rowIndex == continuousWeekRows.length - 1
                      ? lastContinuousRowHeight
                      : baseContinuousRowHeight;
                  rowEl.style.height = rowHeight + "px";

                  var rowCells = rowEl.querySelectorAll("td");
                  Array.prototype.forEach.call(rowCells, function (cellEl) {
                    cellEl.style.height = rowHeight + "px";
                    cellEl.style.boxSizing = "border-box";
                    if (shouldApplyContinuousWeekPacking) {
                      cellEl.style.minWidth = "100px";
                    }

                    var dayFrame = cellEl.querySelector(".fc-daygrid-day-frame");
                    if (dayFrame) {
                      dayFrame.style.height = rowHeight + "px";
                      dayFrame.style.minHeight = rowHeight + "px";
                      dayFrame.style.display = "flex";
                      dayFrame.style.flexDirection = "column";
                    }

                    var dayTop = cellEl.querySelector(".fc-daygrid-day-top");
                    if (dayTop) {
                      var dayTopHeight = Math.max(
                        dayTop.offsetHeight || 0,
                        Math.ceil(widgetFormat.date.fontSize / 16) + 8
                      );
                      dayTop.style.flexShrink = "0";
                      dayTop.style.flexGrow = "0";
                      dayTop.style.height = dayTopHeight + "px";
                      dayTop.style.minHeight = dayTopHeight + "px";
                    }

                    var dayBottom = cellEl.querySelector(".fc-daygrid-day-bottom");
                    if (dayBottom) {
                      dayBottom.style.flexShrink = "0";
                    }

                    var dayEvents = cellEl.querySelector(".fc-daygrid-day-events");
                    if (dayEvents) {
                      dayEvents.style.position = "relative";
                      dayEvents.style.top = "auto";
                      dayEvents.style.bottom = "auto";
                      dayEvents.style.left = "auto";
                      dayEvents.style.right = "auto";
                      dayEvents.style.width = "100%";
                      dayEvents.style.marginTop = "1px";
                      dayEvents.style.flex = "1 1 auto";
                      dayEvents.style.minHeight = "0";
                      dayEvents.style.overflow = "hidden";
                    }
                  });
                }
              );

              if (shouldHideNonFittingTimelineRows) {
                var consumedTimelineHeight = 0;
                var visibleTimelineRows = 0;
                var timelineViewportHeight = Math.max(
                  1,
                  continuousBodyScroller.clientHeight ||
                    continuousDayGridBody.clientHeight ||
                    effectiveVisibleContinuousHeight
                );
                Array.prototype.forEach.call(continuousWeekRows, function (rowEl) {
                  rowEl.style.display = "";
                });

                Array.prototype.forEach.call(continuousWeekRows, function (rowEl) {
                  var rowOuterHeight = rowEl.offsetHeight;
                  if (!rowOuterHeight || rowOuterHeight <= 0) {
                    rowEl.style.display = "none";
                    return;
                  }

                  if (
                    consumedTimelineHeight + rowOuterHeight <=
                    timelineViewportHeight + 0.5
                  ) {
                    consumedTimelineHeight += rowOuterHeight;
                    visibleTimelineRows++;
                    rowEl.style.display = "";
                  } else {
                    rowEl.style.display = "none";
                  }
                });

                if (visibleTimelineRows <= 0 && continuousWeekRows.length > 0) {
                  continuousWeekRows[0].style.display = "";
                  for (var timelineRowIdx = 1; timelineRowIdx < continuousWeekRows.length; timelineRowIdx++) {
                    continuousWeekRows[timelineRowIdx].style.display = "none";
                  }
                }
              }

              if (typeof queueMoreLinkReapplyAfterCompression === "function") {
                queueMoreLinkReapplyAfterCompression();
              }
            };

            // Run after FullCalendar does its own post-render sizing.
            calendar_render_object.updateSize();
            $timeout(applyContinuousCompression, 0);
            $timeout(applyContinuousCompression, 120);
            $timeout(applyContinuousCompression, 650);
            $timeout(applyContinuousCompression, 1100);
          }

          if (
            format.calendarType == "Monthly" &&
            format.isMultiMonthView == true &&
            !isContinuousMultiMonthView &&
            format.multiMonthView == "stack"
          ) {
            var multiMonthStackElement = calendarEl.querySelector(".fc-multimonth");
            var multiMonthStackMonths = calendarEl.querySelectorAll(
              ".fc-multimonth-month"
            );

            if (multiMonthStackElement && multiMonthStackMonths.length > 0) {
              var stackAvailableHeight = multiMonthStackElement.clientHeight;
              if (!stackAvailableHeight || stackAvailableHeight <= 0) {
                stackAvailableHeight = calHeight;
              }
              var minVisibleMonthHeight = 350;
              var visibleMonthsCount = Math.min(
                multiMonthStackMonths.length,
                Math.max(
                  1,
                  Math.floor(stackAvailableHeight / minVisibleMonthHeight)
                )
              );

              var monthOuterHeight = Math.floor(
                stackAvailableHeight / visibleMonthsCount
              );
              if (monthOuterHeight < minVisibleMonthHeight) {
                monthOuterHeight = minVisibleMonthHeight;
              }

              multiMonthStackElement.style.display = "flex";
              multiMonthStackElement.style.flexDirection = "column";
              multiMonthStackElement.style.overflow = "hidden";
              multiMonthStackElement.style.height = stackAvailableHeight + "px";

              Array.prototype.forEach.call(
                multiMonthStackMonths,
                function (monthEl, monthIndex) {
                  if (monthIndex >= visibleMonthsCount) {
                    monthEl.style.display = "none";
                    return;
                  }

                  var monthHeader = monthEl.querySelector(".fc-multimonth-header");
                  monthEl.style.display = "flex";
                  monthEl.style.flexDirection = "column";
                  monthEl.style.minHeight = "0";
                  monthEl.style.flex = "1 1 0";
                  monthEl.style.height = monthOuterHeight + "px";
                  monthEl.style.padding = "0 0 1.2em";
                  monthEl.style.boxSizing = "border-box";

                  var monthDayGrid = monthEl.querySelector(
                    ".fc-multimonth-daygrid"
                  );
                  if (monthDayGrid) {
                    var monthHeaderHeight = monthHeader
                      ? monthHeader.offsetHeight
                      : 0;
                    var monthGridHeight = Math.max(
                      1,
                      monthOuterHeight - monthHeaderHeight - 20
                    );

                    monthDayGrid.style.flex = "1";
                    monthDayGrid.style.minHeight = "0";
                    monthDayGrid.style.overflow = "hidden";
                    monthDayGrid.style.height = monthGridHeight + "px";

                    var monthTable = monthDayGrid.querySelector(
                      ".fc-multimonth-daygrid-table"
                    );
                    if (monthTable) {
                      monthTable.style.height = monthGridHeight + "px";
                    }

                    var dayGridBody = monthDayGrid.querySelector(
                      ".fc-daygrid-body"
                    );
                    if (dayGridBody) {
                      dayGridBody.style.height = monthGridHeight + "px";
                    }

                    var weekRows = monthDayGrid.querySelectorAll("tbody tr");
                    if (weekRows.length > 0) {
                      var rowHeight = Math.floor(monthGridHeight / weekRows.length);

                      Array.prototype.forEach.call(weekRows, function (rowEl) {
                        rowEl.style.height = rowHeight + "px";

                        var rowCells = rowEl.querySelectorAll("td");
                        Array.prototype.forEach.call(rowCells, function (cellEl) {
                          cellEl.style.height = rowHeight + "px";

                          var dayFrame = cellEl.querySelector(".fc-daygrid-day-frame");
                          if (dayFrame) {
                            dayFrame.style.height = rowHeight + "px";
                            dayFrame.style.minHeight = rowHeight + "px";
                            dayFrame.style.display = "flex";
                            dayFrame.style.flexDirection = "column";
                          }

                          var dayTop = cellEl.querySelector(".fc-daygrid-day-top");
                          if (dayTop) {
                            var dayTopHeight = Math.max(
                              dayTop.offsetHeight || 0,
                              Math.ceil(widgetFormat.date.fontSize / 16) + 10
                            );
                            dayTop.style.flexShrink = "0";
                            dayTop.style.flexGrow = "0";
                            dayTop.style.order = "1";
                            dayTop.style.height = dayTopHeight + "px";
                            dayTop.style.minHeight = dayTopHeight + "px";
                            dayTop.style.position = "relative";
                            dayTop.style.zIndex = "2";
                          }

                          var dayBottom = cellEl.querySelector(
                            ".fc-daygrid-day-bottom"
                          );
                          if (dayBottom) {
                            dayBottom.style.flexShrink = "0";
                          }

                          var dayEvents = cellEl.querySelector(
                            ".fc-daygrid-day-events"
                          );
                          if (dayEvents) {
                            dayEvents.style.position = "relative";
                            dayEvents.style.top = "auto";
                            dayEvents.style.bottom = "auto";
                            dayEvents.style.left = "auto";
                            dayEvents.style.right = "auto";
                            dayEvents.style.order = "2";
                            dayEvents.style.width = "100%";
                            dayEvents.style.marginTop = "1px";
                            dayEvents.style.flex = "1 1 auto";
                            dayEvents.style.minHeight = "0";
                            dayEvents.style.overflow = "hidden";
                          }
                        });
                      });
                    }
                  }

                  if (monthHeader) {
                    monthHeader.style.flexShrink = "0";
                  }
                }
              );

              if (typeof queueMoreLinkReapplyAfterCompression === "function") {
                queueMoreLinkReapplyAfterCompression();
              }

              calendar_render_object.updateSize();
            }
          }

          // Grid multiMonth view: stretch month grids to fill widget height
          if (isGridMultiMonthView) {
            var multiMonthGridElement = calendarEl.querySelector(".fc-multimonth");
            var multiMonthGridMonths = calendarEl.querySelectorAll(
              ".fc-multimonth-month"
            );
            var gridMinWidth = 500;

            if (multiMonthGridElement && multiMonthGridMonths.length > 0) {
              // Keep grid month width readable on narrow widgets.
              calendarEl.style.overflowX = "auto";
              multiMonthGridElement.style.minWidth = gridMinWidth + "px";
              multiMonthGridElement.style.overflowX = "visible";

              // Reserve space so bottom borders and last rows are not clipped
              var gridBottomPadding = 10;
              var gridAvailableHeight = multiMonthGridElement.clientHeight - gridBottomPadding;
              if (!gridAvailableHeight || gridAvailableHeight <= 0) {
                gridAvailableHeight = calHeight - gridBottomPadding;
              }

              multiMonthGridElement.style.display = "flex";
              multiMonthGridElement.style.flexWrap = "wrap";
              multiMonthGridElement.style.height = gridAvailableHeight + "px";
              multiMonthGridElement.style.overflowY = "hidden";

              // Use actual rendered row positions so visibility decisions match
              // the final browser layout instead of an estimated column count.
              var rowTolerance = 5;
              var rowTops = [];
              var monthRowIndex = [];
              for (var ri = 0; ri < multiMonthGridMonths.length; ri++) {
                var topValue = multiMonthGridMonths[ri].getBoundingClientRect().top;
                var foundRowIndex = -1;
                for (var rj = 0; rj < rowTops.length; rj++) {
                  if (Math.abs(rowTops[rj] - topValue) < rowTolerance) {
                    foundRowIndex = rj;
                    break;
                  }
                }
                if (foundRowIndex === -1) {
                  rowTops.push(topValue);
                  foundRowIndex = rowTops.length - 1;
                }
                monthRowIndex.push(foundRowIndex);
              }

              var minVisibleMonthHeight = 350;
              var maxRowsThatFit = Math.max(
                1,
                Math.floor(gridAvailableHeight / minVisibleMonthHeight)
              );
              var visibleRows = Math.min(
                rowTops.length || 1,
                maxRowsThatFit
              );

              var monthOuterHeight = Math.floor(
                gridAvailableHeight / Math.max(1, visibleRows)
              );
              if (monthOuterHeight < minVisibleMonthHeight) {
                monthOuterHeight = minVisibleMonthHeight;
              }

              Array.prototype.forEach.call(
                multiMonthGridMonths,
                function (monthEl, monthIndex) {
                  if (monthRowIndex[monthIndex] >= visibleRows) {
                    monthEl.style.display = "none";
                    return;
                  }

                  var monthHeader = monthEl.querySelector(".fc-multimonth-header");
                  monthEl.style.display = "flex";
                  monthEl.style.flexDirection = "column";
                  monthEl.style.minHeight = "0";
                  monthEl.style.height = monthOuterHeight + "px";
                  monthEl.style.boxSizing = "border-box";

                  var monthDayGrid = monthEl.querySelector(
                    ".fc-multimonth-daygrid"
                  );
                  if (monthDayGrid) {
                    var monthHeaderHeight = monthHeader
                      ? monthHeader.offsetHeight
                      : 0;
                    // Calculate available height for the daygrid within the month container.
                    // The negative margin makes the daygrid overlap the header visually,
                    // but the daygrid content must still fit within the month box.
                    // Subtract extra pixels so the last row's bottom border is not clipped.
                    var borderAllowance = 3;
                    var monthGridHeight = Math.max(
                      1,
                      monthOuterHeight - monthHeaderHeight - borderAllowance
                    );

                    monthDayGrid.style.flex = "none";
                    monthDayGrid.style.minHeight = "0";
                    monthDayGrid.style.height = monthGridHeight + "px";

                    var monthTable = monthDayGrid.querySelector(
                      ".fc-multimonth-daygrid-table"
                    );
                    if (monthTable) {
                      monthTable.style.height = monthGridHeight + "px";
                    }

                    var dayGridBody = monthDayGrid.querySelector(
                      ".fc-daygrid-body"
                    );
                    if (dayGridBody) {
                      dayGridBody.style.height = monthGridHeight + "px";
                      var innerTable = dayGridBody.querySelector("table");
                      if (innerTable) {
                        innerTable.style.height = monthGridHeight + "px";
                      }
                    }

                    var weekRows = monthDayGrid.querySelectorAll("tbody tr");
                    if (weekRows.length > 0) {
                      var rowCount = weekRows.length;
                      var baseRowHeight = Math.floor(monthGridHeight / rowCount);
                      // Give the last row any leftover pixels to prevent cutoff
                      var lastRowHeight = monthGridHeight - (baseRowHeight * (rowCount - 1));

                      Array.prototype.forEach.call(weekRows, function (rowEl, idx) {
                        var rh = (idx === rowCount - 1) ? lastRowHeight : baseRowHeight;
                        rowEl.style.height = rh + "px";

                        var rowCells = rowEl.querySelectorAll("td");
                        Array.prototype.forEach.call(rowCells, function (cellEl) {
                          cellEl.style.height = rh + "px";
                        });
                      });
                    }
                  }

                  if (monthHeader) {
                    monthHeader.style.flexShrink = "0";
                  }
                }
              );

              if (typeof queueMoreLinkReapplyAfterCompression === "function") {
                queueMoreLinkReapplyAfterCompression();
              }

              calendar_render_object.updateSize();
            }
          }

          if (isHorizontalList) {
            const tdElements = calendarEl.querySelectorAll("td, th");
            tdElements.forEach((td) => {
              td.style.border = "none";
              td.style.overflow = "hidden";
            });
            const tables = calendarEl.querySelectorAll("table");
            tables.forEach((table) => {
              table.style.border = "none";
            });
          } else {
            if (
              format.calendarType == "List" &&
              calendarwidget.contentType != "mealplan"
            ) {
              var listViewTableBody =
                calendarEl.querySelector(".fc-list-table");
              if (listViewTableBody != null) {
                listViewTableBody.style.overflow = "hidden";
              }
            }else{
            	if(format.isPastEventDeemed){
            		const pastEventElements = calendarEl.querySelectorAll(".fc-day-past");
                	pastEventElements.forEach((pastEvent) => {
                		pastEvent.style.opacity = "0.6";
                	});	
            	}
            }
          }

          if (
            (format.calendarType == "Weeks" ||
              format.calendarType == "Monthly" ||
              format.calendarType == "Schedule") &&
            widgetFormat.gridline != undefined
          ) {
            var calendarEl = document.getElementById(
              fullcalendarId + "_" + $scope.quoteIndex
            );
            const tdElements = calendarEl.querySelectorAll("td, th");

            if (
              format.calendarType == "Monthly" &&
              format.isMultiMonthView != true
            ) {
              var monthTableBodyHeight = widgetHeight - 10;
              var theadHeight = calendarEl.querySelector("thead").offsetHeight;
              monthTableBodyHeight = monthTableBodyHeight - theadHeight;

              if (widgetBackgroundSetting.isNameVisible == true) {
                var calendarNameElement = document.getElementById(
                  "widgetname_" + widgetSettingId + "_" + $scope.quoteIndex
                );
                monthTableBodyHeight =
                  monthTableBodyHeight - calendarNameElement.offsetHeight;
              }

              if (
                format.schedule_title == true &&
                format.calendarType != "List"
              ) {
                var titleHeight =
                  calendarEl.querySelector(".fc-header-toolbar").offsetHeight;
                monthTableBodyHeight = monthTableBodyHeight - titleHeight;
              }

              if (format.showLegends == true) {
                monthTableBodyHeight = monthTableBodyHeight - 31;
              }

              angular
                .element(
                  "#" +
                    fullcalendarId +
                    "_" +
                    $scope.quoteIndex +
                    " .fc-scrollgrid-sync-table"
                )
                .css({
                  height: monthTableBodyHeight + "px",
                });
            }
          }
        });
      } catch (e) {
        // TODO: handle exception
      }

      $timeout(function () {
        if (format.calendarType != "List") {
          var currentDateBgColor = "#d9831f";
          if (widgetFormat.tdic != undefined) {
            if (
              widgetFormat.tdic.fontColor != undefined ||
              widgetFormat.tdic.fontColor != "default"
            ) {
              currentDateBgColor = widgetFormat.tdic.fontColor;
            }
          }

          if (format.calendarType == "Schedule") {
            angular
              .element(
                "#" +
                  fullcalendarId +
                  " .fc-view-harness.fc-view-harness-active"
              )
              .css({
                overflow: "hidden",
              });
          }

          if (format.calendarType == "Weeks") {
            var weeksCalEl = document.getElementById(
              fullcalendarId + "_" + $scope.quoteIndex
            );
            var weeksToolbar = weeksCalEl.querySelector(".fc-header-toolbar");
            var weeksThead = weeksCalEl.querySelector("thead");
            var weeksScrollgrid = weeksCalEl.querySelector(".fc-scrollgrid");
            var weeksContentScroller = weeksCalEl.querySelector(
              ".fc-scroller-liquid-absolute"
            );

            // calculate extra pixels from scrollgrid borders/spacing
            var scrollgridExtra = 0;
            if (weeksScrollgrid && weeksThead && weeksContentScroller) {
              scrollgridExtra =
                weeksScrollgrid.offsetHeight -
                weeksThead.offsetHeight -
                weeksContentScroller.offsetHeight;
            }

            var availableForContent = weeksCalEl.offsetHeight;
            if (weeksToolbar) availableForContent -= weeksToolbar.offsetHeight;
            if (weeksThead) availableForContent -= weeksThead.offsetHeight;
            availableForContent -= scrollgridExtra;

            var weeksCalObj =
              $scope.fullCalendarMap[
                fullcalendarId + "_" + $scope.quoteIndex
              ];
            if (weeksCalObj) {
              weeksCalObj.setOption("contentHeight", availableForContent);
            }
          }

          if (format.calendarType == "Schedule") {
            angular
              .element("#" + fullcalendarId + " .fc-timegrid-col.fc-day-today")
              .css({
                "background-color": hexToRgbA(currentDateBgColor, 8),
              });
          } else {
            var oldDateElement = angular.element(
              "#" + fullcalendarId + " .cal-date-circle"
            );
            if (oldDateElement.length > 0) {
              oldDateElement[0].classList.remove("cal-date-circle");
              oldDateElement[0].classList.remove("bg-danger");
              oldDateElement[0].style.backgroundColor = "unset";
            }

            var element = angular.element(
              "#" + fullcalendarId + " .fc-day-today .fc-daygrid-day-number .cal-day-num"
            );
            if (element.length === 0) {
              element = angular.element(
                "#" + fullcalendarId + " .fc-day-today .fc-daygrid-day-number"
              );
            }
            if (element.length > 0) {
              element[0].classList.add("cal-date-circle");
              element[0].style.backgroundColor = currentDateBgColor;
              element[0].style.height = element[0].clientHeight + "px";
              if (element[0].innerText.length <= 2) {
                element[0].style.width = element[0].clientHeight + "px";
              }
            }
          }
        }
      });

      $timeout(function () {
        if (format.calendarType == "List") {
          if (format.listAllignment == "Horizontal") {
            var contentTable = angular.element(
              "#" + fullcalendarId + " .fc-scrollgrid-sync-table"
            );
            var tds = contentTable[0].querySelectorAll(".fc-daygrid-day-frame");
            tds.forEach((td) => {
              td.style.height = contentTable[0].style.height;
            });

            var element = angular.element(
              "#" + fullcalendarId + " .fc-daygrid-day-frame"
            );
            var scrollOption = {
              scrolling: format.scrolling,
              parentClass: "fc-daygrid-day-frame",
              childClass: "fc-daygrid-day-events",
              padding: 5,
              id: fullcalendarId,
              widgetType: format.calendarType,
            };
            $(element).attr(
              "mango-mirror-scroll",
              angular.toJson(scrollOption)
            );
            $compile(angular.element(element))($scope);
          } else {
            var element = angular.element(
              "#" + fullcalendarId + " .fc-scroller-liquid"
            );
            var scrollOption = {
              scrolling: format.scrolling,
              parentClass: "fc-scroller-liquid",
              childClass: "fc-list-table",
              padding: 20,
              id: fullcalendarId,
              widgetType: format.calendarType,
            };
            $(element).attr(
              "mango-mirror-scroll",
              angular.toJson(scrollOption)
            );
            $compile(angular.element(element))($scope);
          }
          
          
          //todo calculate max width based on element by class name
          var timedElement = angular.element(
                  "#" + fullcalendarId + " .cutome-time-size"
                );
          
          var maxWidth = 0;
          angular.forEach(timedElement, function (el) {
            var w = angular.element(el).outerWidth(); // or .width()
            if (w > maxWidth) {
              maxWidth = w;
            }
          });
          maxWidth = maxWidth + 2;
          angular.forEach(timedElement, function (el) {
        	  angular.element(el).css("width", maxWidth + "px");
        	});
          }

          $scope.completeCalendarPresetRender(
            calendarwidget,
            calendarPresetRenderToken,
            800
          );
      }, 500);
    };

    // =========================================================================
    // Horizontal multi-month view: renders individual dayGridMonth FC instances
    // per month, then transplants their FULL day cells into a horizontal table.
    // By transplanting FC's own rendered cells (not custom HTML), we get
    // identical behavior to single-month view: today highlighting, date
    // formatting, alignment, photo backgrounds, event styling, etc.
    // =========================================================================
    $scope.renderHorizontalWithFC = function (
      eventList,
      format,
      calendarwidget,
      initialDate
    ) {
      var widgetSettingId = calendarwidget.widgetSettingId;
      var language = calendarwidget.data.user_language;
      var defaultStartDate = calendarwidget.data.initial_date;
      var widgetBackgroundSetting = calendarwidget.widgetBackgroundSettingModel;
      var widgetFormat = JSON.parse(widgetBackgroundSetting.widgetFormat);
      var widgetTitleFormat = JSON.parse(
        widgetBackgroundSetting.widgetTitleFormat
      );
      var presetAwareWidgetSize = $scope.getPresetAwareWidgetSize(
        calendarwidget,
        widgetBackgroundSetting
      );
      var widgetHeight = presetAwareWidgetSize.height;
      var widgetWidth = presetAwareWidgetSize.width;
      var calendarPresetRenderToken = null;

      var fullcalendarId = "calendar_" + widgetSettingId;
      var calendarEl = document.getElementById(
        fullcalendarId + "_" + $scope.quoteIndex
      );
      if (!calendarEl) return;

      // Guard against stale async strip renders (rapid refresh/swipe/update).
      $scope.yearlyStripRenderSeq = ($scope.yearlyStripRenderSeq || 0) + 1;
      var stripRenderToken = String($scope.yearlyStripRenderSeq);
      calendarEl.setAttribute("data-mm-strip-render-token", stripRenderToken);
      var isStaleStripRender = function () {
        return (
          calendarEl.getAttribute("data-mm-strip-render-token") !==
          stripRenderToken
        );
      };

      // Parse start date safely (avoid UTC timezone shift)
      var startDate;
      var referenceStartDate = initialDate || defaultStartDate;
      var dateParts = (referenceStartDate || "").split("-");
      if (dateParts.length === 3) {
        startDate = new Date(
          parseInt(dateParts[0], 10),
          parseInt(dateParts[1], 10) - 1,
          parseInt(dateParts[2], 10)
        );
      } else {
        startDate = new Date();
      }

      var isYearlyCalendarEnabled =
        format.isYearlyCalendarEnabled === true ||
        format.isYearlyCalendarEnabled === "true";

      var buildMonthInfo = function (targetDate) {
        return {
          year: targetDate.getFullYear(),
          month: targetDate.getMonth(),
          name: targetDate
            .toLocaleDateString(language || "en", { month: "short" }),
          days: new Date(
            targetDate.getFullYear(),
            targetDate.getMonth() + 1,
            0
          ).getDate(),
          startDateStr:
            targetDate.getFullYear() +
            "-" +
            String(targetDate.getMonth() + 1).padStart(2, "0") +
            "-01",
        };
      };

      // Build month info
      var monthsInfo = [];
      if (isYearlyCalendarEnabled) {
        for (var yearMonth = 0; yearMonth < 12; yearMonth++) {
          var yearlyDate = new Date(startDate.getFullYear(), yearMonth, 1);
          monthsInfo.push(buildMonthInfo(yearlyDate));
        }
      } else {
        var parseMonthArray = function (value) {
          try {
            var parsed = JSON.parse(value || "[]");
            return Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            return [];
          }
        };

        var yearlyMonths = parseMonthArray(format.y_selectedMonths);
        var usesYearlySelectedMonths = yearlyMonths.length > 0;
        // y_selectedMonths follows the passed start date (initialDate) when available.
        // If initialDate is not provided, offsets are applied from current month.
        var monthOffsetBaseDate =
          usesYearlySelectedMonths && initialDate ? startDate : new Date();
        var selectedMonths = yearlyMonths;
        if (!Array.isArray(selectedMonths) || selectedMonths.length === 0) return;

        selectedMonths = selectedMonths
          .map(function (monthOffset) {
            return parseInt(monthOffset, 10);
          })
          .filter(function (monthOffset) {
            return !isNaN(monthOffset);
          })
          .sort(function (a, b) {
            return a - b;
          });
        if (selectedMonths.length === 0) return;

        for (var mi = 0; mi < selectedMonths.length; mi++) {
          // [4,5,6] means base month +4, +5, +6.
          var targetDate = new Date(
            monthOffsetBaseDate.getFullYear(),
            monthOffsetBaseDate.getMonth() + mi,
            1
          );
          monthsInfo.push(buildMonthInfo(targetDate));
        }
      }

      calendarPresetRenderToken = $scope.beginCalendarPresetRender(
        calendarwidget,
        widgetBackgroundSetting
      );

      // Calculate available height
      // Calculate available height for the horizontal container.
      // Only subtract space for elements OUTSIDE the container (widget name,
      // legend). The calendar title inside the container is measured
      // dynamically after render in the transplant function.
      var calHeight = widgetHeight - 3;
      if (widgetBackgroundSetting.isNameVisible == true) {
        calHeight = calHeight - widgetTitleFormat.fontSize * 1.5;
      }
      if (format.showLegends == true) {
        calHeight = calHeight - 31;
      }
      calHeight = Math.ceil(calHeight);

      var totalDayCols = 31;

      var gridBorder = "none";
      if (widgetFormat.gridline && widgetFormat.gridline.format == "all") {
        gridBorder =
          widgetFormat.gridline.thickness.width +
          "px " +
          widgetFormat.gridline.thickness.style +
          " " +
          widgetFormat.gridline.fontColor;
      }

      var dateFontSize = widgetFormat.date
        ? widgetFormat.date.fontSize / 16 + "em"
        : "0.7em";
      var dateFontFamily = widgetFormat.date
        ? widgetFormat.date.fontFamily
        : "inherit";
      var dateFontColor = widgetFormat.date
        ? widgetFormat.date.fontColor
        : "inherit";
      var titleFontSize = widgetFormat.title
        ? widgetFormat.title.fontSize / 16 + "em"
        : "1em";

      // Step 1: Build the horizontal table structure with EMPTY day cells
      var container = document.createElement("div");
      container.className = "horizontal-multimonth-container";
      var finalHorizontalId = fullcalendarId + "_horizontal";
      container.id = finalHorizontalId + "_staging_" + stripRenderToken;
      container.style.width = "100%";
      container.style.height = calHeight + "px";
      container.style.overflow = "hidden";
      container.style.boxSizing = "border-box";

      // Title
      if (format.schedule_title == true) {
        var titleDiv = document.createElement("div");
        titleDiv.style.textAlign = widgetFormat.title
          ? widgetFormat.title.alignment || "center"
          : "center";
        titleDiv.style.fontSize = titleFontSize;
        titleDiv.style.fontFamily = widgetFormat.title
          ? widgetFormat.title.fontFamily
          : "inherit";
        titleDiv.style.fontWeight = "inherit";
        if (
          widgetFormat.title &&
          widgetFormat.title.fontColor &&
          widgetFormat.title.fontColor !== "default"
        ) {
          titleDiv.style.color = widgetFormat.title.fontColor;
        }
        titleDiv.style.padding = "2px 0";
        var firstM = monthsInfo[0];
        var lastM = monthsInfo[monthsInfo.length - 1];
        var titleText = new Date(
          firstM.year,
          firstM.month,
          1
        ).toLocaleDateString(language || "en", { month: "long" });
        if (monthsInfo.length > 1) {
          titleText +=
            " \u2013 " +
            new Date(lastM.year, lastM.month, 1).toLocaleDateString(
              language || "en",
              { month: "long" }
            );
        }
        titleText += " " + lastM.year;
        titleDiv.textContent = titleText;
        container.appendChild(titleDiv);
      }

      var table = document.createElement("table");
      table.style.width = "100%";
      table.style.height = calHeight + "px";
      table.style.tableLayout = "fixed";
      table.style.borderCollapse = "collapse";

      if (widgetFormat.gridline && widgetFormat.gridline.format == "outer") {
        table.style.border = gridBorder;
      }

      var colgroup = document.createElement("colgroup");
      var mc = document.createElement("col");
      mc.style.width = "5%";
      colgroup.appendChild(mc);
      var dayColW = (95 / totalDayCols).toFixed(3) + "%";
      for (var c = 0; c < totalDayCols; c++) {
        var dc = document.createElement("col");
        dc.style.width = dayColW;
        colgroup.appendChild(dc);
      }
      table.appendChild(colgroup);

      var tbody = document.createElement("tbody");

      // Store references to table cells keyed by date for later transplant
      var tableCellsByDate = {};

      for (var ri = 0; ri < monthsInfo.length; ri++) {
        var mInfo = monthsInfo[ri];
        var tr = document.createElement("tr");
        tr.style.height = "auto";
        var titleAlignment = widgetFormat.title
          ? widgetFormat.title.alignment || "center"
          : "center";

        // Month label — styled using title formatting (not date formatting)
        var monthTd = document.createElement("td");
        monthTd.style.fontWeight = "inherit";
        monthTd.style.fontSize = titleFontSize;
        monthTd.style.fontFamily = widgetFormat.title
          ? widgetFormat.title.fontFamily
          : "inherit";
        monthTd.style.textAlign = titleAlignment;
        monthTd.style.verticalAlign = "middle";
        monthTd.style.whiteSpace = "nowrap";
        monthTd.style.padding = "2px 4px";
        if (
          widgetFormat.title &&
          widgetFormat.title.fontColor &&
          widgetFormat.title.fontColor !== "default"
        ) {
          monthTd.style.color = widgetFormat.title.fontColor;
        } else {
          monthTd.style.color = "unset";
        }
        if (widgetFormat.gridline && widgetFormat.gridline.format == "all") {
          monthTd.style.border = gridBorder;
        }
        var mInner = document.createElement("div");
        mInner.style.height = "100%";
        mInner.style.overflow = "hidden";
        mInner.style.display = "flex";
        mInner.style.alignItems = "center";
        // Inherit title styles from month cell to avoid double-scaling in em units.
        mInner.style.fontSize = "inherit";
        mInner.style.fontFamily = "inherit";
        mInner.style.fontWeight = "inherit";
        mInner.style.justifyContent =
          titleAlignment == "left"
            ? "flex-start"
            : titleAlignment == "right"
            ? "flex-end"
            : "center";
        mInner.textContent = mInfo.name;
        monthTd.appendChild(mInner);
        tr.appendChild(monthTd);

        // Day cells 1-31 (empty — FC content will be transplanted in)
        for (var day = 1; day <= 31; day++) {
          var td = document.createElement("td");
          td.style.verticalAlign = "top";
          td.style.padding = "0";
          td.style.boxSizing = "border-box";
          td.style.overflow = "hidden";

          if (widgetFormat.gridline && widgetFormat.gridline.format == "all") {
            td.style.border = gridBorder;
          }

          // Inner wrapper to enforce fixed height
          var innerDiv = document.createElement("div");
          innerDiv.style.height = "100%";
          innerDiv.style.maxHeight = "100%";
          innerDiv.style.overflow = "hidden";

          if (day <= mInfo.days) {
            var dateKey =
              mInfo.year +
              "-" +
              String(mInfo.month + 1).padStart(2, "0") +
              "-" +
              String(day).padStart(2, "0");
            innerDiv.setAttribute("data-date", dateKey);
            tableCellsByDate[dateKey] = { inner: innerDiv, td: td };
          }

          td.appendChild(innerDiv);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }

      table.appendChild(tbody);
      container.appendChild(table);

      // Step 2: Create hidden containers and render individual FC instances
      var hiddenWrapper = document.createElement("div");
      hiddenWrapper.style.position = "absolute";
      hiddenWrapper.style.left = "-9999px";
      hiddenWrapper.style.top = "0";
      hiddenWrapper.style.width = widgetWidth + "px";
      hiddenWrapper.className = "horizontal-fc-hidden";

      // Keep new strip render off-screen to prevent blank flicker.
      var stagingRoot = document.createElement("div");
      stagingRoot.className = "horizontal-strip-staging";
      stagingRoot.style.position = "absolute";
      stagingRoot.style.left = "-9999px";
      stagingRoot.style.top = "0";
      stagingRoot.style.width = "100%";
      stagingRoot.style.visibility = "hidden";
      stagingRoot.style.pointerEvents = "none";

      // Single-month format (no multiMonth, no scroll to avoid parentElement crash off-screen)
      var singleMonthFormat = JSON.parse(JSON.stringify(format));
      singleMonthFormat.calendarType = "Monthly";
      singleMonthFormat.isMultiMonthView = false;
      singleMonthFormat.m_selectedMonths = undefined;
      singleMonthFormat.y_selectedMonths = undefined;
      singleMonthFormat.m_scroll = "Off";
      singleMonthFormat.y_scroll = "Off";
      singleMonthFormat.isYearlyStripRender = true;
      singleMonthFormat.sourceWidgetSettingId = widgetSettingId;

      var fcRenderCount = 0;
      var totalMonths = monthsInfo.length;

      for (var mi = 0; mi < monthsInfo.length; mi++) {
        (function (monthIdx, mInfo) {
          var fcDiv = document.createElement("div");
          var hWidgetId = widgetSettingId + "_horizontal_" + monthIdx;
          fcDiv.id = "calendar_" + hWidgetId + "_" + $scope.quoteIndex;
          fcDiv.style.width = widgetWidth + "px";
          fcDiv.style.height = "400px";
          hiddenWrapper.appendChild(fcDiv);

          $timeout(function () {
            $scope.drawFullCalendar(
              eventList,
              "dayGridMonth",
              singleMonthFormat,
              hWidgetId,
              true,
              language,
              mInfo.startDateStr,
              widgetBackgroundSetting,
              {
                height: 400,
                width: widgetWidth,
                contentType: calendarwidget.contentType,
                data: calendarwidget.data,
                widgetSettingId: hWidgetId,
                widgetBackgroundSettingModel: widgetBackgroundSetting,
              }
            );

            fcRenderCount++;

            if (fcRenderCount === totalMonths) {
              // Wait for all FC callbacks (dayCellDidMount, eventDidMount,
              // photo loading, today highlighting) to complete
              $timeout(function () {
                if (isStaleStripRender()) {
                  if (stagingRoot.parentNode) {
                    stagingRoot.parentNode.removeChild(stagingRoot);
                  }
                  return;
                }
                $scope.transplantFCCellsToHorizontal(
                  hiddenWrapper,
                  tableCellsByDate,
                  format,
                  widgetFormat,
                  fullcalendarId,
                  calHeight,
                  monthsInfo.length,
                  container,
                  table,
                  tbody,
                  language,
                  function () {
                    if (isStaleStripRender()) {
                      if (stagingRoot.parentNode) {
                        stagingRoot.parentNode.removeChild(stagingRoot);
                      }
                      return;
                    }
                    container.id = finalHorizontalId;
                    while (calendarEl.firstChild) {
                      calendarEl.removeChild(calendarEl.firstChild);
                    }
                    calendarEl.appendChild(container);
                    if (stagingRoot.parentNode) {
                      stagingRoot.parentNode.removeChild(stagingRoot);
                    }
                    $scope.completeCalendarPresetRender(
                      calendarwidget,
                      calendarPresetRenderToken,
                      100
                    );
                  }
                );
              }, 2500);
            }
          }, 200 * monthIdx);
        })(mi, monthsInfo[mi]);
      }

      // Insert new render tree off-screen; keep old content visible until ready.
      calendarEl.style.height = calHeight + "px";
      stagingRoot.appendChild(hiddenWrapper);
      stagingRoot.appendChild(container);
      calendarEl.appendChild(stagingRoot);

    };

    // =========================================================================
    // Transplant FULL FC day cells (date numbers, events, backgrounds, today
    // highlighting, etc.) from hidden FC instances into horizontal table cells.
    // This preserves all FC rendering: dayCellDidMount styles, eventDidMount
    // customizations, fc-day-today class, past event dimming, photo backgrounds.
    // =========================================================================
    $scope.transplantFCCellsToHorizontal = function (
      sourceEl,
      tableCellsByDate,
      format,
      widgetFormat,
      fullcalendarId,
      calHeight,
      numMonths,
      container,
      table,
      tbody,
      language,
      onReady
    ) {
      var allFcDays = sourceEl.querySelectorAll(".fc-daygrid-day");
      var processed = {};
      var resolvedStripTitleColor = null;
      if (
        widgetFormat.title &&
        widgetFormat.title.fontColor &&
        widgetFormat.title.fontColor !== "default"
      ) {
        resolvedStripTitleColor = widgetFormat.title.fontColor;
      } else {
        var stripTitleEl = container
          ? container.querySelector("div:first-child")
          : null;
        if (stripTitleEl && window.getComputedStyle) {
          var computedTitleColor = window.getComputedStyle(stripTitleEl).color;
          if (
            computedTitleColor &&
            computedTitleColor !== "transparent" &&
            computedTitleColor !== "rgba(0, 0, 0, 0)"
          ) {
            resolvedStripTitleColor = computedTitleColor;
          }
        }
      }

      Array.prototype.forEach.call(allFcDays, function (dayEl) {
        var dateStr = dayEl.getAttribute("data-date");
        if (!dateStr || processed[dateStr]) return;
        var cellRef = tableCellsByDate[dateStr];
        if (!cellRef) return;
        processed[dateStr] = true;

        var targetInner = cellRef.inner;
        var targetTd = cellRef.td;

        // Copy FC classes to the TD (fc-day-today, fc-day-past, fc-day-future, etc.)
        var fcClasses = dayEl.className.split(" ");
        for (var ci = 0; ci < fcClasses.length; ci++) {
          var cls = fcClasses[ci].trim();
          if (
            cls &&
            (cls.indexOf("fc-day") === 0 || cls === "fc-daygrid-day")
          ) {
            targetTd.classList.add(cls);
          }
        }

        // Copy data-date attribute to TD for today highlighting selector
        targetTd.setAttribute("data-date", dateStr);

        // Copy background styles from FC cell (photo calendar fills the day cell bg)
        if (dayEl.style.background && dayEl.style.background.indexOf("url") >= 0) {
          targetTd.style.background = dayEl.style.background;
          targetTd.style.backgroundSize = dayEl.style.backgroundSize || "cover";
          targetTd.style.backgroundRepeat = "no-repeat";
          targetTd.style.backgroundPosition = "center";
        }

        // Weekend text styling (no background tint in strip view)
        var dayDate = new Date(dateStr + "T00:00:00");
        var dow = dayDate.getDay();
        var isWeekend = dow === 0 || dow === 6;
        var weekendTitleColor = resolvedStripTitleColor;

        // Get the FC day frame (contains date number + events)
        var dayFrame = dayEl.querySelector(".fc-daygrid-day-frame");
        if (!dayFrame) return;

        // Clear inner div and move the entire FC day frame content
        targetInner.innerHTML = "";
        targetInner.style.display = "flex";
        targetInner.style.flexDirection = "column";

        // Move the day-top (date number row) — FC's dayCellDidMount already
        // applied alignment (justifyContent), font, size, and color.
        // We must re-apply the flex properties that FC's CSS provides via
        // ".fc .fc-daygrid-day-top { display:flex; flex-direction:row-reverse }"
        // because those scoped rules no longer apply outside the .fc container.
        // The date row is fixed at the top and never scrolled over.
        var dayTop = dayFrame.querySelector(".fc-daygrid-day-top");
        if (dayTop) {
          dayTop.style.flexShrink = "0";

          // Build weekday + date header on a single row.
          // Weekday and date each have independent alignment within the row.
          // When both share the same alignment, they sit together (weekday
          // left of date). When different, each floats to its own side.
          var weekdayName = dayDate.toLocaleDateString(language || "en", {
            weekday: "short",
          });

          var dayAlignment = widgetFormat.day
            ? widgetFormat.day.alignment || "center"
            : "center";
          var dateAlignment = widgetFormat.date
            ? widgetFormat.date.alignment || "center"
            : "center";

          // Keep date-number styling aligned with Monthly view even after
          // moving nodes out of FullCalendar's scoped DOM.
          var dayNumber = dayTop.querySelector(".fc-daygrid-day-number");
          if (dayNumber && widgetFormat.date) {
            dayNumber.style.fontSize = widgetFormat.date.fontSize / 16 + "em";
            dayNumber.style.fontFamily = widgetFormat.date.fontFamily;
            if (
              widgetFormat.date.fontColor &&
              widgetFormat.date.fontColor !== "default"
            ) {
              dayNumber.style.color = widgetFormat.date.fontColor;
            } else {
              dayNumber.style.color = "unset";
            }
            if (isWeekend && weekendTitleColor) {
              dayNumber.style.color = weekendTitleColor;
            }
          }

          // Create weekday span with day formatting
          var weekdaySpan = document.createElement("span");
          weekdaySpan.className = "horizontal-weekday";
          weekdaySpan.textContent = weekdayName;
          if (widgetFormat.day) {
            weekdaySpan.style.fontSize =
              widgetFormat.day.fontSize / 16 + "em";
            weekdaySpan.style.fontFamily = widgetFormat.day.fontFamily;
            if (
              widgetFormat.day.fontColor &&
              widgetFormat.day.fontColor !== "default"
            ) {
              weekdaySpan.style.color = widgetFormat.day.fontColor;
            }
          }
          if (isWeekend && weekendTitleColor) {
            weekdaySpan.style.color = weekendTitleColor;
          }
          weekdaySpan.style.whiteSpace = "nowrap";

          dayTop.style.paddingLeft = "2px";
          dayTop.style.paddingRight = "2px";

          if (dayAlignment === dateAlignment) {
            // Same alignment: single flex row, weekday and date grouped
            // together with shared justifyContent. With row-reverse,
            // appending weekday after date puts it visually to the left.
            dayTop.style.display = "flex";
            dayTop.style.flexDirection = "row-reverse";
            dayTop.style.alignItems = "baseline";
            // justifyContent already set by FC's dayCellDidMount
            weekdaySpan.style.marginRight = "2px";
            dayTop.appendChild(weekdaySpan);
          } else {
            // Different alignments: each gets its own half of the row
            // and aligns independently within it
            dayTop.style.display = "flex";
            dayTop.style.flexDirection = "row";
            dayTop.style.alignItems = "baseline";

            var weekdayWrap = document.createElement("div");
            weekdayWrap.style.display = "flex";
            weekdayWrap.style.justifyContent = dayAlignment;
            weekdayWrap.style.flex = "1";
            weekdayWrap.style.minWidth = "0";
            weekdayWrap.appendChild(weekdaySpan);

            var dateWrap = document.createElement("div");
            dateWrap.style.display = "flex";
            dateWrap.style.justifyContent = dateAlignment;
            dateWrap.style.flex = "1";
            dateWrap.style.minWidth = "0";
            while (dayTop.firstChild) {
              dateWrap.appendChild(dayTop.firstChild);
            }

            dayTop.appendChild(weekdayWrap);
            dayTop.appendChild(dateWrap);
          }

          targetInner.appendChild(dayTop);
        }

        // Move the events container into a clipping wrapper so scrolling
        // happens only within the remaining space below the date row —
        // exactly like single-month view where the date number stays fixed.
        var eventsContainer = dayFrame.querySelector(
          ".fc-daygrid-day-events"
        );
        if (eventsContainer) {
          // Remove the "+N more" links since we'll handle scrolling
          var moreLinks = eventsContainer.querySelectorAll(
            ".fc-daygrid-day-bottom"
          );
          Array.prototype.forEach.call(moreLinks, function (ml) {
            ml.style.display = "none";
          });

          // Sort harnesses: all-day first, then by time ascending
          var harnesses = Array.prototype.slice.call(
            eventsContainer.querySelectorAll(".fc-daygrid-event-harness")
          );
          harnesses.sort(function (a, b) {
            var parseTime = function (el) {
              var t = el.querySelector(".fc-event-time");
              if (!t) return -1;
              var match = t.textContent
                .trim()
                .toLowerCase()
                .match(/(\d+):?(\d*)([ap]m)/);
              if (!match) return 0;
              var h = parseInt(match[1], 10);
              var m = match[2] ? parseInt(match[2], 10) : 0;
              if (match[3] === "pm" && h !== 12) h += 12;
              if (match[3] === "am" && h === 12) h = 0;
              return h * 60 + m;
            };
            return parseTime(a) - parseTime(b);
          });

          // Reset harness positioning (FC uses absolute positioning)
          harnesses.forEach(function (h) {
            h.style.position = "relative";
            h.style.top = "0";
            h.style.left = "0";
            h.style.right = "auto";
            h.style.visibility = "visible";
            var eventElements = h.querySelectorAll(".fc-daygrid-event");
            Array.prototype.forEach.call(eventElements, function (eventEl) {
              eventEl.style.margin = "1px 2px 0px 2px";
            });
          });

          // Clipping wrapper: takes remaining space below date row, clips overflow
          var eventsClip = document.createElement("div");
          eventsClip.className = "horizontal-events-clip";
          eventsClip.style.flex = "1";
          eventsClip.style.overflow = "hidden";
          eventsClip.style.position = "relative";
          eventsClip.style.minHeight = "0";
          eventsClip.appendChild(eventsContainer);
          targetInner.appendChild(eventsClip);
        }
      });

      // Size the table and rows AFTER transplant so content doesn't force
      // rows taller than intended. Tables treat `height` as min-height,
      // so we wrap in a clipping div to enforce the boundary.
      var titleEl = container.querySelector("div:first-child");
      var actualTitleH = 0;
      if (format.schedule_title == true && titleEl && !titleEl.querySelector("table")) {
        actualTitleH = titleEl.offsetHeight;
      }
      var tableH = calHeight - actualTitleH;

      var tableWrapper = document.createElement("div");
      tableWrapper.style.height = tableH + "px";
      tableWrapper.style.overflow = "hidden";
      table.parentNode.insertBefore(tableWrapper, table);
      tableWrapper.appendChild(table);
      table.style.height = tableH + "px";

      var rowH = Math.floor(tableH / numMonths);
      var allRows = tbody.querySelectorAll("tr");
      for (var r = 0; r < allRows.length; r++) {
        allRows[r].style.height = rowH + "px";
      }
      // Table cells ignore max-height per CSS spec, so we use absolute
      // positioning on inner divs. This removes them from the TD's content
      // flow, allowing the TD's explicit height to be respected.
      var allTds = table.querySelectorAll("td");
      for (var d = 0; d < allTds.length; d++) {
        allTds[d].style.position = "relative";
        allTds[d].style.height = rowH + "px";
        allTds[d].style.overflow = "hidden";
      }
      var allInners = table.querySelectorAll("td > div");
      for (var d = 0; d < allInners.length; d++) {
        allInners[d].style.position = "absolute";
        allInners[d].style.top = "0";
        allInners[d].style.left = "0";
        allInners[d].style.right = "0";
        allInners[d].style.bottom = "0";
        allInners[d].style.height = "auto";
        allInners[d].style.maxHeight = "none";
        allInners[d].style.overflow = "hidden";
      }

      var pendingPostProcessCount = 0;
      var notifyStripReady = function () {
        if (
          pendingPostProcessCount === 0 &&
          typeof onReady === "function"
        ) {
          var readyFn = onReady;
          onReady = null;
          readyFn();
        }
      };

      // Apply today highlighting on the horizontal container
      pendingPostProcessCount++;
      $timeout(function () {
        var horizontalEl = container || document.getElementById(fullcalendarId + "_horizontal");
        if (horizontalEl) {
          var currentDateBgColor = "#d9831f";
          if (widgetFormat.tdic != undefined) {
            if (
              widgetFormat.tdic.fontColor != undefined &&
              widgetFormat.tdic.fontColor != "default"
            ) {
              currentDateBgColor = widgetFormat.tdic.fontColor;
            }
          }

          var todayCell = horizontalEl.querySelector(
            "td.fc-day-today .fc-daygrid-day-number .cal-day-num"
          );
          if (!todayCell) {
            todayCell = horizontalEl.querySelector(
              "td.fc-day-today .fc-daygrid-day-number"
            );
          }
          if (todayCell) {
            todayCell.classList.add("cal-date-circle");
            todayCell.style.backgroundColor = currentDateBgColor;
            todayCell.style.height = todayCell.clientHeight + "px";
            if (todayCell.innerText.length <= 2) {
              todayCell.style.width = todayCell.clientHeight + "px";
            }
          }

          // Past event dimming
          if (format.isPastEventDeemed) {
            var pastCells = horizontalEl.querySelectorAll("td.fc-day-past");
            Array.prototype.forEach.call(pastCells, function (cell) {
              cell.style.opacity = "0.6";
            });
          }
        }
        pendingPostProcessCount--;
        notifyStripReady();
      }, 100);

      // Apply overflow scrolling for strip view using the same directive path.
      // Path aligned with grid/monthly scrolling behavior.
      // Keeps strip behavior in sync with grid-style scrolling.
      var monthLikeScroll =
        format.calendarType == "Yearly"
          ? format.y_scroll || "Off"
          : format.m_scroll || "Off";
      if (monthLikeScroll !== "Fast" && monthLikeScroll !== "Slow") {
        if (format.y_scroll == "Fast" || format.y_scroll == "Slow") {
          monthLikeScroll = format.y_scroll;
        } else if (format.m_scroll == "Fast" || format.m_scroll == "Slow") {
          monthLikeScroll = format.m_scroll;
        }
      }
      if (monthLikeScroll == "Fast" || monthLikeScroll == "Slow") {
        pendingPostProcessCount++;
        $timeout(function () {
          Object.keys(tableCellsByDate).forEach(function (dateKey) {
            var cellRef = tableCellsByDate[dateKey];
            var cellDiv = cellRef.inner;
            var clipDiv = cellDiv.querySelector(".horizontal-events-clip");
            if (!clipDiv) return;
            var eventsDiv = clipDiv.querySelector(".fc-daygrid-day-events");
            if (!eventsDiv || eventsDiv.children.length === 0) return;

            var clipH = clipDiv.clientHeight;
            var eventsH = eventsDiv.scrollHeight;
            if (eventsH <= clipH || clipH <= 0) return;

            var scrollOption = {
              isMultiMonth: false,
              scrolling: monthLikeScroll,
              parentClass: "fc-daygrid-day-events",
              childClass: "fc-daygrid-event-harness",
              padding: 20,
              id: fullcalendarId,
              widgetType: "Monthly",
            };
            $scope.checkAndUpdateRootScope(scrollOption);
            clipDiv.setAttribute("mango-mirror-scroll", angular.toJson(scrollOption));
            $compile(angular.element(clipDiv))($scope);
          });
          pendingPostProcessCount--;
          notifyStripReady();
        }, 500);
      }
      notifyStripReady();
    };

    $scope.clearRenderObject = function (fullcalendarId, calendarBuildObject) {
      var calendar_render_object =
        $scope.fullCalendarMap[fullcalendarId + "_" + $scope.quoteIndex];
      if (calendar_render_object != null) {
        calendar_render_object.destroy();
      }
    };

    $scope.getFullcalendarRenderObject = function (widgetSettingid) {
      for (var i = 0; i < $scope.fullcalendarObjectList.length; i++) {
        var element = $scope.fullcalendarObjectList[i];
        if (
          element.widgetSettingid == widgetSettingid &&
          element.page_number == $scope.quoteIndex
        ) {
          return element;
          break;
        }
      }
      return;
    };

    $scope.checkImage = function (url) {
      const deferred = $q.defer();
      const img = new Image();
      img.src = url;

      img.onload = function () {
        deferred.resolve(true);
      };

      img.onerror = function () {
        deferred.resolve(false);
      };

      return deferred.promise;
    };

    $scope.setFullcalendarRenderObject = function (
      widgetSettingid,
      calendar_render_object
    ) {
      if ($scope.fullcalendarObjectList.length == 0) {
        $scope.fullcalendarObjectList.push({
          calendarObject: calendar_render_object,
          widgetSettingid: widgetSettingid,
          page_number: $scope.quoteIndex,
        });
      } else {
        var foundIndex = -1;
        for (var i = 0; i < $scope.fullcalendarObjectList.length; i++) {
          var element = $scope.fullcalendarObjectList[i];
          if (
            element.widgetSettingid == widgetSettingid &&
            element.page_number == $scope.quoteIndex
          ) {
            foundIndex = i;
          }
        }
        if (foundIndex > -1) {
          $scope.fullcalendarObjectList[foundIndex].calendarObject =
            calendar_render_object;
          $scope.fullcalendarObjectList[foundIndex].page_number =
            $scope.quoteIndex;
        } else {
          $scope.fullcalendarObjectList.push({
            calendarObject: calendar_render_object,
            widgetSettingid: widgetSettingid,
            page_number: $scope.quoteIndex,
          });
        }
      }

      return;
    };

    $scope.checkAndUpdateRootScope = function (newData) {
      var isDatafound = false;
      for (let data of $rootScope.scrollingObject) {
        if (data.id == newData.id) {
          data.scrolling = newData.scrolling;
          isDatafound = true;
        }
      }

      if ($rootScope.scrollingObject.length == 0 || isDatafound == false) {
        $rootScope.scrollingObject.push(newData);
      }
    };

    function isImageExist(date, events) {
      var photocalendarData = { imageUrl: null, imageResolution: null };
      for (var i = 0; i < events.length; i++) {
        var startDate = new Date(events[i].start);
        var endDate = new Date(events[i].end);
        var eventDate = startDate.getDate() + "-" + startDate.getMonth();

        if (date == eventDate) {
          if (
            events[i].hasOwnProperty("imageUrl") &&
            events[i].imageUrl != "" &&
            events[i].fillDayWithFirstPhotoOnly != undefined &&
            events[i].fillDayWithFirstPhotoOnly == true
          ) {
            photocalendarData.imageUrl = events[i].imageUrl;
            photocalendarData.imageResolution = events[i].imageResolution;
            return photocalendarData;
          }
        }
      }
      return null;
    }

    $scope.icalCalendarDataUpdateTimeout = function (calendarwidget) {
      $scope.updateIcalEvent(calendarwidget);
    };

    $scope.calendarDataUpdateTimeout = function (calendarwidget) {
      $scope.getUpdatedCalendar(calendarwidget);
    };

    var getEventDaysBetweenDates = function (startDate, endDate) {
      var date = [];
      if (endDate._i.includes("00:00:00")) {
        while (moment(startDate) < moment(endDate)) {
          date.push(moment(startDate).format("YYYY-MM-DD HH:mm"));
          startDate = moment(startDate).add(1, "days").format("YYYY-MM-DD");
        }
      } else {
        while (moment(startDate) <= moment(endDate)) {
          date.push(moment(startDate).format("YYYY-MM-DD HH:mm"));
          startDate = moment(startDate).add(1, "days").format("YYYY-MM-DD");
        }
      }
      return date;
    };

    $scope.checkAndGetUpdatedEvent = function (event) {
      var date1 = moment(event.start);
      var date2 = moment(event.end);
      if (event.end.includes("23:59:59")) {
        date2 = moment(event.end).add(1, "days");
      }
      var diffDays = moment(date2).diff(moment(date1), "days");
      var events = [];

      var d1 = moment(event.start); //startDate
      var d2 = moment(event.end); //endDate

      if (event.end.includes("23:59:59")) {
        d2 = moment(event.end).add(1, "days");
      }

      var eventDates = getEventDaysBetweenDates(d1, d2);
      var temp = {};
      if (diffDays > 1) {
        var startDate = eventDates[0];
        for (var i = 0; i < eventDates.length; i++) {
          var temp = {};
          var endDate = eventDates[i + 1];
          if (i == eventDates.length - 1) {
            endDate = event.end;
          }
          temp.start = startDate;
          temp.end = endDate;
          events.push(temp);
          startDate = endDate;
        }
      } else if (diffDays == 0) {
        var temp = {};
        temp.start = event.start;
        temp.end = event.end;
        events.push(temp);
      } else {
        var temp = {};
        temp.start = eventDates[0];
        temp.end = eventDates[eventDates.length - 1];
        events.push(temp);
      }
      return events;
    };

    $scope.updateIcalInterval = function () {
      if ($scope.icalInterval != undefined) {
        $interval.cancel($scope.icalInterval);
      }

      if ($scope.icalCalendarWidgetList.length > 0) {
        $timeout(function () {
          $scope.updateLatestIcalApi();
        }, 1000);
        $scope.icalInterval = $interval(function () {
          $scope.updateLatestIcalApi();
        }, 60000);
      }
    };
    
    $scope.updateSnapshotsOnLoad = function(){
    	if ($scope.snapShotWidgetList.length > 0) {    		
	        $timeout(function () {
	        	 $scope.updateAllSnapShots();
	        }, Math.floor(Math.random() * (90000 - 2000 + 1)) + 2000);
      }    	
    }
    
    $scope.updateAllSnapShots = function(){
    	if($scope.isChildDisplay == true){
    		return
    	}
    	  
    	var payload = {
	        widgetSettingIds: $scope.snapShotWidgetList
	      };
	      $http({
	        method: "PUT",
	        url: MANGO_MIRROR_CONSTANT.processSnapshots,
	        headers: {
	          "Content-Type": "application/json",
	          authtoken: $rootScope.authToken,
	          "accept-language": "en-US, en; q = 0.8",
	          source: "webApp",
	        },
	        data: payload,
	      }).then(
	        function (res) {},
	        function (error) {
	          console.log(error);
	        }
	      );
    }

    $scope.updateLatestIcalApi = function () {
      var icalWidgets = $scope.icalCalendarWidgetList.toString();
      var payload = {
        icalAccount: $scope.icalAccountList,
        selectedCalendarList: $scope.icalCalendarList,
        timeZoneId: $scope.timeZoneId,
      };

      $http({
        method: "PUT",
        url:
          MANGO_MIRROR_CONSTANT.icalEventUpdate +
          $scope.userId +
          "/" +
          icalWidgets,
        headers: {
          "Content-Type": "application/json",
          authtoken: $rootScope.authToken,
          "accept-language": "en-US, en; q = 0.8",
          source: "webApp",
        },
        data: payload,
      }).then(
        function (res) {},
        function (error) {
          console.log(error);
        }
      );
    };

//    $scope.updateTodoInterval = function (widgetSettingId, todoWidget) {
//      var isRecordFound = false;
//      var foundIndex = -1;
//      for (var i = 0; i < $scope.todoWidgetInterval.length; i++) {
//        if ($scope.todoWidgetInterval[i].widgetId == widgetSettingId) {
//          isRecordFound = true;
//          foundIndex = i;
//          break;
//        }
//      }
//      if (isRecordFound == false) {
//        var todoInterval = $interval(function () {
//          $scope.todoDataUpdateTimeout(todoWidget, "google,outlook,todoist");
//        }, 300000);
//        var data = {
//          intervalObject: todoInterval,
//          widgetId: todoWidget.widgetSettingId,
//          isInitialized: true,
//        };
//        $scope.todoWidgetInterval.push(data);
//      }
//    };

    $scope.autoCompleteChores = function () {
      var projects = [];
      var widgetSettingIds = [];
      for (var i = 0; i < $scope.choresWidgetInterval.length; i++) {
        var tempProjects = $scope.choresWidgetInterval[i].selectedProjects;
        for (var j = 0; j < tempProjects.length; j++) {
          if (
            !projects.includes(tempProjects[j].projectId) &&
            (tempProjects[j].projectName == "Mango Chores" ||
              tempProjects[j].projectName == "Mango Chores & Rewards")
          ) {
            projects.push(tempProjects[j].projectId);
          }
          if (
            !widgetSettingIds.includes($scope.choresWidgetInterval[i].widgetId)
          ) {
            widgetSettingIds.push($scope.choresWidgetInterval[i].widgetId);
          }
        }
      }

      var payload = {
        widgetSettingIds: widgetSettingIds,
        choresProject: projects,
        userMirrorId: $scope.userMirrorId,
      };
      $http({
        method: "PUT",
        url: MANGO_MIRROR_CONSTANT.choresAutoComplete,
        headers: {
          "Content-Type": "application/json",
          authtoken: $rootScope.authToken,
          "accept-language": "en-US, en; q = 0.8",
          source: "webApp",
        },
        data: payload,
      }).then(
        function (res) {},
        function (error) {
          console.log(error);
        }
      );
    };

    $scope.updateChoresDataInterval = function (isInitialCall) {
      if ($scope.choresWidgetList.length > 0 && isInitialCall) {
        $timeout(function () {
          $scope.updateLatestChoresApi(true);
        }, Math.floor(Math.random() * (30000 - 2000 + 1)) + 2000);
      }
    };
    
    $scope.updateTodoDataInterval = function(isInitialCall){
    	if ($scope.todoInterval != undefined) {
	        $interval.cancel($scope.todoInterval);
	     }

        if ($scope.todoWidgetList.length > 0) {
          if (isInitialCall) {
            $timeout(function () {
              $scope.checkAndUpdateTodoData(isInitialCall);
            }, Math.floor(Math.random() * (30000 - 2000 + 1)) + 2000);
         }

        $scope.todoInterval = $interval(function () {
          $scope.checkAndUpdateTodoData(false);
        }, 300000);
      }
    }
    
    $scope.checkAndUpdateTodoData = function (isInitialCall) {
    	
        if($scope.isChildDisplay == true){
     		  return
     	  }
         var payload = {
           widgetSettingIds: $scope.todoWidgetList,
           userMirrorId: $scope.userMirrorId,
           isInitialChoresDataUpdateCall: isInitialCall,
         };
         $http({
           method: "PUT",
           url: MANGO_MIRROR_CONSTANT.todoDataUpdate,
           headers: {
             "Content-Type": "application/json",
             authtoken: $rootScope.authToken,
             "accept-language": "en-US, en; q = 0.8",
             source: "webApp",
           },
           data: payload,
         }).then(
           function (res) {},
           function (error) {
             console.log(error);
           }
         );
       };

    $scope.updateLatestChoresApi = function (isInitialCall) {
    	
     if($scope.isChildDisplay == true){
  		  return
  	  }
      var payload = {
        widgetSettingIds: $scope.choresWidgetList,
        userMirrorId: $scope.userMirrorId,
        isInitialChoresDataUpdateCall: isInitialCall,
      };
      $http({
        method: "PUT",
        url: MANGO_MIRROR_CONSTANT.choresDataUpdate,
        headers: {
          "Content-Type": "application/json",
          authtoken: $rootScope.authToken,
          "accept-language": "en-US, en; q = 0.8",
          source: "webApp",
        },
        data: payload,
      }).then(
        function (res) {},
        function (error) {
          console.log(error);
        }
      );
    };

    $scope.updateAutocompleteSetting = function (widgetSettingId, todoWidget) {
      var isRecordFound = false;
      var foundIndex = -1;
      for (var i = 0; i < $scope.choresWidgetInterval.length; i++) {
        if ($scope.choresWidgetInterval[i].widgetId == widgetSettingId) {
          isRecordFound = true;
          foundIndex = i;
          break;
        }
      }
      if (isRecordFound == false) {
        if (
          todoWidget.data != undefined &&
          todoWidget.data.autoCompleteTaskInterval != undefined
        ) {
          if ($scope.todoAutoComplete != undefined) {
            $timeout.cancel($scope.todoAutoComplete);
            $scope.todoAutoComplete = null;
          }

          $scope.todoAutoComplete = $timeout(function () {
            $scope.autoCompleteChores();
          }, todoWidget.data.autoCompleteTaskInterval);
        }

        var data = {
          widgetId: todoWidget.widgetSettingId,
          selectedProjects: todoWidget.data.selected_projects,
        };
        $scope.choresWidgetInterval.push(data);
      }
    };

//    $scope.todoDataUpdateTimeout = function (todoWidget, source) {
//      $scope.updateTodoEvent(todoWidget, source);
//    };

    $scope.updateCalendarTimeout = function (calendarwidget) {
      var isCalendarRefreshFound = false;
      for (var i = 0; i < $scope.calendarRefreshTimeout.length; i++) {
        if (
          $scope.calendarRefreshTimeout[i].widgetId ==
          calendarwidget.widgetSettingId
        ) {
          isCalendarRefreshFound = true;
          break;
        }
      }

      if (isCalendarRefreshFound == false) {
        var calendarTimeout = $timeout(function () {
          $scope.calendarDataUpdateTimeout(calendarwidget);
        }, calendarwidget.data.calendarRefreshTime);
        var calendarTimeoutData = {
          calendarTimeoutObject: calendarTimeout,
          widgetId: calendarwidget.widgetSettingId,
        };
        $scope.calendarRefreshTimeout.push(calendarTimeoutData);
      }
    };

    // this function is sued to update data for chores and todo both
    $scope.updateTodoTimeout = function (todoWidget) {
      var isExistingDataFound = false;
      for (var i = 0; i < $scope.todoRefreshTimeout.length; i++) {
        if (
          $scope.todoRefreshTimeout[i].widgetId == todoWidget.widgetSettingId
        ) {
          isExistingDataFound = true;
          break;
        }
      }
      if(isExistingDataFound==false){
    	  var todoTimeout = $timeout(function () {
	        $scope.refreshTodoData(todoWidget);
	      }, todoWidget.data.refreshTimeInterval);
	      var todoTimeoutData = {
	        todoTimeoutObject: todoTimeout,
	        widgetId: todoWidget.widgetSettingId,
	      };
	      $scope.todoRefreshTimeout.push(todoTimeoutData);  
      }
    };

    $scope.formatDate = function (is24hourFormat, date, userLanguage) {
      const format12HourNoLeadingZero = new Intl.DateTimeFormat(userLanguage, {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const formatDate = new Intl.DateTimeFormat(userLanguage, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const format24HourNoLeadingZero = new Intl.DateTimeFormat(userLanguage, {
        hour: "numeric",
        minute: "numeric",
        hour12: false,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      var parsedDate = new Date(date.replace(" ", "T"));

      try {
        if (date.includes("00:00:00")) {
          return formatDate.format(parsedDate);
        } else if (date != null) {
          if (!is24hourFormat) {
            return format12HourNoLeadingZero.format(parsedDate);
          } else {
            return format24HourNoLeadingZero.format(parsedDate);
          }
        }
      } catch (e) {
        console.log(e.message);
      }
    };

    $scope.updateUserLocalTimeZone = function (todowidget) {
      function formatTodoTimeWithSubTasks(todo) {
        if (todo == undefined) {
          return;
        }

        if (todo.st_time != null && todo.isDateFormated == undefined) {
          todo.st_time = $scope.formatDate(
            todowidget.data.hour24Format,
            todo.st_time,
            todowidget.data.user_language
          );
          todo["isDateFormated"] = true;
        }

        if (Array.isArray(todo.subTasks) && todo.subTasks.length > 0) {
          for (var j = 0; j < todo.subTasks.length; j++) {
            formatTodoTimeWithSubTasks(todo.subTasks[j]);
          }
        }
      }

      if (todowidget.data.todos != undefined) {
        for (var i = 0; i < todowidget.data.todos.length; i++) {
          formatTodoTimeWithSubTasks(todowidget.data.todos[i]);
        }
      }
    };

//    $scope.initialTodoDataLoad = function (todoWidget) {
//      $timeout(function () {
//        $scope.updateTodoEvent(todoWidget, "google,outlook,todoist");
//      }, Math.floor(Math.random() * (90000 - 2000 + 1)) + 2000);
//    };

    $scope.updateTodoFontSize = function (todowidget) {
      var id =
        "todo_" +
        todowidget.widgetSettingId +
        "_" +
        $scope.quoteIndex +
        "_primary";
      var elementId = document.getElementById(id);
      if (elementId != null) {
        var titleFormatObject = JSON.parse(
          todowidget.widgetBackgroundSettingModel.widgetTitleFormat
        );
        var todoRenderHeight =
          Number(todowidget.renderHeight) || todowidget.height;
        if (todowidget.widgetBackgroundSettingModel.isNameVisible == false) {
          elementId.style.height = todoRenderHeight + "px";
        } else {
          elementId.style.height =
            todoRenderHeight - titleFormatObject.fontSize * 1.5 + "px";
        }

        var widgetFormat = JSON.parse(
          todowidget.widgetBackgroundSettingModel.widgetFormat
        );
        var todoEvent = angular.element("#" + id + " .todoTask");
        var todoDate = angular.element("#" + id + " .todoDate");
        var todoCheckBox = angular.element("#" + id + " .todocheckbox");
        var todoProjects = angular.element("#" + id + " .todoproject");
        // Update CSS properties of the child element

        if (todoProjects.length >= 0) {
          todoProjects.each(function () {
            var todoProject = angular.element(this); // Current todoEvent element
            todoProject.css({
              color: widgetFormat.label.fontColor, // Example of changing background color
              "font-size": widgetFormat.label.fontSize / 16 + "rem", // Example of changing font size
              "font-family": widgetFormat.label.fontFamily,
              display: "flex",
              "justify-content": widgetFormat.label.alignment,
            });
          });
        }

        if (todoCheckBox.length >= 0) {
          todoCheckBox.each(function () {
            var todoCB = angular.element(this);
            todoCB.css({
              height: (widgetFormat.task.fontSize / 16) * 1.5 + "rem",
              width: (widgetFormat.task.fontSize / 16) * 1.5 + "rem",
            });
          });
        }

        if (todoEvent.length >= 0) {
          todoEvent.each(function () {
            var todo = angular.element(this); // Current todoEvent element
            todo.css({
              color: widgetFormat.task.fontColor, // Example of changing background color
              "font-size": widgetFormat.task.fontSize / 16 + "rem", // Example of changing font size
              "font-family": widgetFormat.task.fontFamily,
              display: "flex",
              "justify-content": widgetFormat.task.alignment,
            });
          });
        }

        if (todoDate.length >= 0) {
          todoDate.each(function () {
            var todoDateElement = angular.element(this); // Current todoEvent element
            todoDateElement.css({
              color: widgetFormat.date.fontColor, // Example of changing background color
              "font-size": widgetFormat.date.fontSize / 16 + "rem", // Example of changing font size
              "font-family": widgetFormat.date.fontFamily,
              display: "100%",
              "text-align": widgetFormat.date.alignment,
            });
          });
        }
      }
    };

    $scope.initializeTodo = function (todowidget, isFontResizeNeeded) {
    	if (isFontResizeNeeded) {
    		$timeout(function () {
    			$scope.updateTodoFontSize(todowidget);
    		}, 200);
    	}

      $scope.updateUserLocalTimeZone(todowidget);
      if (todowidget.data.refreshTimeInterval > 0) {
        $scope.updateTodoTimeout(todowidget);
      }
    };

    $scope.updateChoresFontSize = function (todowidget) {
      var id = "chores_" + todowidget.widgetSettingId + "_" + $scope.quoteIndex;
      var elementId = document.getElementById(id);
      if (elementId == null) {
        $timeout(function () {
          $scope.updateChoresFontSize(todowidget);
        }, 1000);
        return;
      } else {
        var titleFormatObject = JSON.parse(
          todowidget.widgetBackgroundSettingModel.widgetTitleFormat
        );
        var choresRenderHeight =
          Number(todowidget.renderHeight) || todowidget.height;
        if (todowidget.widgetBackgroundSettingModel.isNameVisible == false) {
          elementId.style.height = choresRenderHeight + "px";
        } else {
          elementId.style.height =
            choresRenderHeight - titleFormatObject.fontSize * 1.5 + "px";
        }

        var widgetFormat = JSON.parse(
          todowidget.widgetBackgroundSettingModel.widgetFormat
        );

        // Get the parent element by id
        //									var parentElement = angular.element(elemetId);
        var todoEvent = angular.element("#" + id + " .todoTask");
        var todoDate = angular.element("#" + id + " .todoDate");
        var todoCheckBox = angular.element("#" + id + " .todocheckbox");
        var todoLabels = angular.element("#" + id + " .labels");

        var parentId = "chores_" + todowidget.widgetSettingId;
        var routineLabels = angular.element("#" + parentId + " .routinelabels");

        var todoGroupLabelNames = angular.element("#" + id + " .group-name");
        var todoGroupPoints = angular.element("#" + id + " .group-points");

        // Update CSS properties of the child element

        if (todowidget.data.accountType == "MangoChores") {
          var choresReward = angular.element("#" + id + " .choresbadge");
          if (choresReward.length >= 0) {
            choresReward.each(function () {
              var choresCR = angular.element(this);
              choresCR.css({
                color: widgetFormat.chores_reward.fontColor,
                "font-size": widgetFormat.chores_reward.fontSize + "px",
                "font-family": widgetFormat.chores_reward.fontFamily,
                display: "flex",
                "justify-content": widgetFormat.chores_reward.alignment,
              });
            });
          }

          var choresImage = angular.element("#" + id + " .choresavatar");
          if (choresImage.length >= 0) {
            choresImage.each(function () {
              var choresIm = angular.element(this);
              choresIm.css({
                display: "flex",
                "justify-content": widgetFormat.chores_image.alignment,
              });
            });
          }
        }

        if (todoCheckBox.length >= 0) {
          todoCheckBox.each(function () {
            var todoCB = angular.element(this);
            todoCB.css({
              height: (widgetFormat.task.fontSize / 16) * 1.5 + "rem",
              width: (widgetFormat.task.fontSize / 16) * 1.5 + "rem",
            });
          });
        }

        if (todoLabels.length >= 0) {
          todoLabels.each(function () {
            var todoLabel = angular.element(this); // Current todoEvent element
            todoLabel.css({
              color: widgetFormat.label.fontColor, // Example of changing background color
              "font-size": widgetFormat.label.fontSize / 16 + "rem", // Example of changing font size
              "font-family": widgetFormat.label.fontFamily,
              display: "flex",
              "justify-content": widgetFormat.label.alignment,
            });
          });
        }

        if (routineLabels.length >= 0) {
          routineLabels.each(function () {
            var routineLabel = angular.element(this); // Current todoEvent element
            routineLabel.css({
              color: widgetFormat.label.fontColor, // Example of changing background color
              "font-size": widgetFormat.label.fontSize / 16 + "rem", // Example of changing font size
              "font-family": widgetFormat.label.fontFamily,
              display: "flex",
              "justify-content": widgetFormat.label.alignment,
            });
          });
        }

        if (todoGroupLabelNames.length >= 0) {
          todoGroupLabelNames.each(function () {
            var todoGpLabelName = angular.element(this); // Current todoEvent element
            todoGpLabelName.css({
              color: widgetFormat.task.fontColor, // Example of changing background color
              "font-size": widgetFormat.task.fontSize / 16 + "rem", // Example of changing font size
              "font-family": widgetFormat.task.fontFamily,
              display: "flex",
              "justify-content": "center",
            });
          });
        }

        if (todoEvent.length >= 0) {
          todoEvent.each(function () {
            var todo = angular.element(this); // Current todoEvent element
            todo.css({
              color: widgetFormat.task.fontColor, // Example of changing background color
              "font-size": widgetFormat.task.fontSize / 16 + "rem", // Example of changing font size
              "font-family": widgetFormat.task.fontFamily,
              display: "flex",
              "justify-content": widgetFormat.task.alignment,
            });
          });
        }

        if (todoDate.length >= 0) {
          todoDate.each(function () {
            var todoDateElement = angular.element(this);
            todoDateElement[0].style.setProperty(
              "color",
              widgetFormat.date.fontColor,
              "important"
            );
            todoDateElement.css({
              "font-size": widgetFormat.date.fontSize / 16 + "rem", // Example of changing font size
              "font-family": widgetFormat.date.fontFamily,
              width: "100%",
              "text-align": widgetFormat.task.alignment,
            });
          });
        }

        if (todoGroupPoints.length >= 0) {
          todoGroupPoints.each(function () {
            var todoGpPoint = angular.element(this); // Current todoEvent element
            todoGpPoint.css({
              color: widgetFormat.date.fontColor, // Example of changing background color
              "font-size": widgetFormat.date.fontSize / 16 + "rem", // Example of changing font size
              "font-family": widgetFormat.date.fontFamily,
              display: "flex",
              "justify-content": "center",
            });
          });
        }
      }
    };

    $scope.initializeChores = function (choreswidget, isFontResizeNeeded) {
      if (isFontResizeNeeded) {
        $timeout(function () {
          $scope.updateChoresFontSize(choreswidget);
        }, 200);
      }

      if (choreswidget.data.refreshTimeInterval > 0) {
        $scope.updateTodoTimeout(choreswidget);
      }

      $scope.updateChoresTimeZone(choreswidget);
      $scope.updateAutocompleteSetting(
        choreswidget.widgetSettingId,
        choreswidget
      );
    };

    $scope.updateChoresTimeZone = function (todowidget) {
      if (todowidget.data.todos != undefined) {
        var keys = Object.keys(todowidget.data.todos);
        for (var i = 0; i < keys.length; i++) {
          var label = keys[i];
          angular.forEach(
            todowidget.data.todos[label].data,
            function (task, key) {
              if (task.st_time != null && task.isDateFormated == undefined) {
                task.st_time = $scope.formatDate(
                  todowidget.data.hour24Format,
                  task.st_time,
                  todowidget.data.user_language
                );
                task["isDateFormated"] = true;
              }
            }
          );
        }
      }
    };

    $scope.mergeCountDownFormat = function (baseFormat, overrideFormat) {
      var mergedFormat = angular.copy(baseFormat || {});
      if (!overrideFormat || typeof overrideFormat !== "object") {
        return mergedFormat;
      }

      var formatKeys = ["fontColor", "fontSize", "fontFamily", "alignment"];
      for (var i = 0; i < formatKeys.length; i++) {
        var key = formatKeys[i];
        if (
          overrideFormat[key] !== undefined &&
          overrideFormat[key] !== null &&
          overrideFormat[key] !== ""
        ) {
          mergedFormat[key] = overrideFormat[key];
        }
      }

      return mergedFormat;
    };

    $scope.getCountDownSectionPartFormat = function (
      widgetFormat,
      sectionKey,
      partKey
    ) {
      if (!widgetFormat || typeof widgetFormat !== "object") {
        return {};
      }

      function hasFontProps(formatObject) {
        return (
          formatObject &&
          typeof formatObject === "object" &&
          (formatObject.fontColor !== undefined ||
            formatObject.fontSize !== undefined ||
            formatObject.fontFamily !== undefined ||
            formatObject.alignment !== undefined)
        );
      }

      var resolvedFormat = angular.copy(widgetFormat[partKey] || {});
      var sectionKeys = [sectionKey];
      if (sectionKey === "day") {
        sectionKeys.push("days");
      } else if (sectionKey === "hour") {
        sectionKeys.push("hours");
      } else if (sectionKey === "minute") {
        sectionKeys.push("minutes");
      } else if (sectionKey === "second") {
        sectionKeys.push("seconds");
      }

      var titlePartKey = partKey.charAt(0).toUpperCase() + partKey.slice(1);
      for (var i = 0; i < sectionKeys.length; i++) {
        var currentSection = sectionKeys[i];

        var directCandidate =
          widgetFormat[currentSection + titlePartKey] ||
          widgetFormat[currentSection + "_" + partKey] ||
          widgetFormat[currentSection + partKey];

        if (hasFontProps(directCandidate)) {
          resolvedFormat = $scope.mergeCountDownFormat(
            resolvedFormat,
            directCandidate
          );
        }

        var nestedCandidate = widgetFormat[currentSection];
        if (nestedCandidate && typeof nestedCandidate === "object") {
          if (hasFontProps(nestedCandidate[partKey])) {
            resolvedFormat = $scope.mergeCountDownFormat(
              resolvedFormat,
              nestedCandidate[partKey]
            );
          } else if (hasFontProps(nestedCandidate)) {
            resolvedFormat = $scope.mergeCountDownFormat(
              resolvedFormat,
              nestedCandidate
            );
          }
        }

        if (
          widgetFormat.sections &&
          typeof widgetFormat.sections === "object" &&
          widgetFormat.sections[currentSection]
        ) {
          var sectionObject = widgetFormat.sections[currentSection];
          if (hasFontProps(sectionObject[partKey])) {
            resolvedFormat = $scope.mergeCountDownFormat(
              resolvedFormat,
              sectionObject[partKey]
            );
          } else if (hasFontProps(sectionObject)) {
            resolvedFormat = $scope.mergeCountDownFormat(
              resolvedFormat,
              sectionObject
            );
          }
        }
      }

      return resolvedFormat;
    };

    $scope.fitCountDownTextToBox = function (
      textElement,
      maxWidth,
      maxHeight,
      minFontPixels,
      maxFontPixels
    ) {
      if (!textElement) {
        return;
      }

      var availableWidth = Number(maxWidth) || 0;
      var availableHeight = Number(maxHeight) || 0;
      if (availableWidth <= 0 || availableHeight <= 0) {
        return;
      }

      var minSize = Number(minFontPixels);
      if (isNaN(minSize) || minSize <= 0) {
        minSize = 4;
      }

      var maxSize = Number(maxFontPixels);
      if (isNaN(maxSize) || maxSize < minSize) {
        maxSize = minSize;
      }

      textElement.style.whiteSpace = "nowrap";
      textElement.style.overflow = "hidden";
      textElement.style.textOverflow = "ellipsis";
      textElement.style.width = "100%";
      textElement.style.display = "block";

      var low = 1;
      var high = Math.floor(maxSize);
      var best = low;

      while (low <= high) {
        var mid = Math.floor((low + high) / 2);
        textElement.style.fontSize = mid + "px";
        var fitsWidth = textElement.scrollWidth <= availableWidth + 1;
        var fitsHeight = textElement.scrollHeight <= availableHeight + 1;

        if (fitsWidth && fitsHeight) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      textElement.style.fontSize = best + "px";
    };

    $scope.updateCountDownFontSize = function (countdownWidget) {
      var id =
        "countdown_" +
        countdownWidget.widgetSettingId +
        "_" +
        $scope.quoteIndex;
      var elementId = document.getElementById(id);
      if (elementId == null) {
        $timeout(function () {
          $scope.updateCountDownFontSize(countdownWidget);
        }, 200);
        return;
      } else {
        var titleFormatObject = JSON.parse(
          countdownWidget.widgetBackgroundSettingModel.widgetTitleFormat
        );
        var renderHeight =
          Number(countdownWidget.renderHeight) || countdownWidget.height;
        var renderWidth =
          Number(countdownWidget.renderWidth) || countdownWidget.width;
        elementId.style.width = renderWidth + "px";
        if (
          countdownWidget.widgetBackgroundSettingModel.isNameVisible == false
        ) {
          elementId.style.height = renderHeight + "px";
        } else {
          elementId.style.height =
            renderHeight - titleFormatObject.fontSize * 1.5 + "px";
        }

        var widgetFormat = JSON.parse(
          countdownWidget.widgetBackgroundSettingModel.widgetFormat
        );
        var defaultValueFormat = widgetFormat.value || {};
        var defaultUnitFormat = widgetFormat.unit || {};
        var labelFormat = widgetFormat.label || {};

        // Get the parent element by id
        var countDownValues = angular.element("#" + id + " .value");
        var countDownUnits = angular.element("#" + id + " .unit");
        var countDownEventName = document.getElementById(
          "countdownevent_" +
            countdownWidget.widgetSettingId +
            "_" +
            $scope.quoteIndex
        );
        var countDownEventText = countDownEventName
          ? countDownEventName.querySelector(".countdown-event-text")
          : null;
        var countDownEqualElement = document.querySelector(
          "#" + id + " .equal-element"
        );
        var countDownValuesWrapper = countDownEventName
          ? countDownEventName.parentElement &&
            countDownEventName.parentElement.children &&
            countDownEventName.parentElement.children.length > 1
            ? countDownEventName.parentElement.children[1]
            : null
          : null;

        // Update CSS properties of the child element

        if (countDownValues.length >= 0) {
          countDownValues.each(function () {
            var countDownValue = angular.element(this);
            countDownValue.css({
              color: defaultValueFormat.fontColor,
              "font-size": (defaultValueFormat.fontSize || 12) + "px",
              "font-family": defaultValueFormat.fontFamily,
              "text-align": defaultValueFormat.alignment,
            });
          });
        }

        if (countDownUnits.length >= 0) {
          countDownUnits.each(function () {
            var countDownUnit = angular.element(this);
            countDownUnit[0].style.setProperty(
              "color",
              defaultUnitFormat.fontColor,
              "important"
            );
            countDownUnit.css({
              "font-size": (defaultUnitFormat.fontSize || 10) + "px",
              "font-family": defaultUnitFormat.fontFamily,
              "text-align": defaultUnitFormat.alignment,
            });
          });
        }

        var isAutoFitEnabled =
          countdownWidget.widgetBackgroundSettingModel &&
          countdownWidget.widgetBackgroundSettingModel.autofit == true;

        if (isAutoFitEnabled) {
          var totalWidgetHeight =
            Number(countdownWidget.renderHeight) || countdownWidget.height || 0;
          var widgetNameHeight = 0;
          if (
            countdownWidget.widgetBackgroundSettingModel &&
            countdownWidget.widgetBackgroundSettingModel.isNameVisible == true
          ) {
            var widgetNameElement = document.getElementById(
              "widgetname_" +
                countdownWidget.widgetSettingId +
                "_" +
                $scope.quoteIndex
            );
            if (widgetNameElement) {
              widgetNameHeight = widgetNameElement.offsetHeight || 0;
            }
          }

          var availableHeight = Math.max(0, totalWidgetHeight - widgetNameHeight);
          var eventHeight = Math.floor(availableHeight * 0.2);
          var valuesAndLabelsHeight = Math.max(0, availableHeight - eventHeight);

          elementId.style.height = availableHeight + "px";

          if (countDownEventName) {
            countDownEventName.style.height = eventHeight + "px";
            countDownEventName.style.width = "100%";
            countDownEventName.style.display = "flex";
            countDownEventName.style.alignItems = "center";
            countDownEventName.style.justifyContent = "center";
            countDownEventName.style.lineHeight = "normal";
            countDownEventName.style.overflow = "hidden";
          }

          if (countDownValuesWrapper) {
            countDownValuesWrapper.style.height = valuesAndLabelsHeight + "px";
          }

          if (countDownEqualElement) {
            countDownEqualElement.style.height = "100%";
            countDownEqualElement.style.alignItems = "stretch";
          }
        } else if (countDownEventName) {
          countDownEventName.style.height = "";
          countDownEventName.style.width = "";
          countDownEventName.style.display = "";
          countDownEventName.style.alignItems = "";
          countDownEventName.style.justifyContent = "";
          countDownEventName.style.lineHeight = "";
          countDownEventName.style.overflow = "";
          if (countDownValuesWrapper) {
            countDownValuesWrapper.style.height = "";
          }
          if (countDownEqualElement) {
            countDownEqualElement.style.height = "";
            countDownEqualElement.style.alignItems = "";
          }
        }

        var sectionBoxes = document.querySelectorAll(
          "#" + id + " .count-down-box"
        );
        var sectionValueAutoFitEntries = [];
        var sectionUnitAutoFitEntries = [];
        Array.prototype.forEach.call(sectionBoxes, function (boxElement) {
          var sectionKey =
            boxElement.getAttribute("data-countdown-section") || "";
          var valueElement = boxElement.querySelector(".value");
          var unitElement = boxElement.querySelector(".unit");

          var valueFormat = $scope.getCountDownSectionPartFormat(
            widgetFormat,
            sectionKey,
            "value"
          );
          var unitFormat = $scope.getCountDownSectionPartFormat(
            widgetFormat,
            sectionKey,
            "unit"
          );

          if (valueElement) {
            valueElement.style.color = valueFormat.fontColor;
            valueElement.style.fontFamily = valueFormat.fontFamily;
            valueElement.style.textAlign = valueFormat.alignment;
          }

          if (unitElement) {
            unitElement.style.setProperty("color", unitFormat.fontColor, "important");
            unitElement.style.fontFamily = unitFormat.fontFamily;
            unitElement.style.textAlign = unitFormat.alignment;
          }

          if (!isAutoFitEnabled) {
            boxElement.style.height = "";
            boxElement.style.display = "";
            boxElement.style.flexDirection = "";
            boxElement.style.justifyContent = "";
            boxElement.style.rowGap = "";
            if (valueElement) {
              valueElement.style.fontSize =
                (Number(valueFormat.fontSize) || Number(defaultValueFormat.fontSize) || 12) +
                "px";
            }
            if (unitElement) {
              unitElement.style.fontSize =
                (Number(unitFormat.fontSize) || Number(defaultUnitFormat.fontSize) || 10) +
                "px";
            }
            return;
          }

          boxElement.style.height = "100%";
          boxElement.style.display = "flex";
          boxElement.style.flexDirection = "column";
          boxElement.style.justifyContent = "center";
          boxElement.style.rowGap = "1ch";

          var boxComputedStyle = window.getComputedStyle(boxElement);
          var boxPaddingLeft = parseFloat(boxComputedStyle.paddingLeft) || 0;
          var boxPaddingRight = parseFloat(boxComputedStyle.paddingRight) || 0;
          var boxPaddingTop = parseFloat(boxComputedStyle.paddingTop) || 0;
          var boxPaddingBottom = parseFloat(boxComputedStyle.paddingBottom) || 0;
          var rowGapPixels = parseFloat(boxComputedStyle.rowGap);
          if (isNaN(rowGapPixels)) {
            rowGapPixels = 0;
          }

          var boxWidth = Math.max(
            0,
            boxElement.clientWidth - boxPaddingLeft - boxPaddingRight
          );
          var boxHeight = Math.max(
            0,
            boxElement.clientHeight - boxPaddingTop - boxPaddingBottom
          );
          var usableTextHeight = Math.max(0, boxHeight - rowGapPixels);
          var valueHeight = Math.max(0, Math.floor(usableTextHeight * 0.7));
          var unitHeight = Math.max(0, usableTextHeight - valueHeight);

          var shortSideForValue = Math.min(boxWidth, valueHeight);
          var shortSideForUnit = Math.min(boxWidth, unitHeight);
          var valueMin = Math.max(1, Math.min(8, Math.floor(shortSideForValue * 0.18)));
          var unitMin = Math.max(1, Math.min(6, Math.floor(shortSideForUnit * 0.18)));
          var valueMax = 300;
          var unitMax = 300;

          if (valueElement) {
            sectionValueAutoFitEntries.push({
              valueElement: valueElement,
              boxWidth: boxWidth,
              valueHeight: valueHeight,
              valueMin: valueMin,
              valueMax: valueMax,
            });
          }
          if (unitElement) {
            sectionUnitAutoFitEntries.push({
              unitElement: unitElement,
              boxWidth: boxWidth,
              unitHeight: unitHeight,
              unitMin: unitMin,
              unitMax: unitMax,
            });
          }
        });

        if (isAutoFitEnabled && sectionValueAutoFitEntries.length > 0) {
          var commonValueFontSize = null;
          sectionValueAutoFitEntries.forEach(function (entry) {
            $scope.fitCountDownTextToBox(
              entry.valueElement,
              entry.boxWidth,
              entry.valueHeight,
              entry.valueMin,
              entry.valueMax
            );

            var fittedFontSize = parseFloat(
              window.getComputedStyle(entry.valueElement).fontSize
            );
            if (!isNaN(fittedFontSize)) {
              commonValueFontSize =
                commonValueFontSize == null
                  ? fittedFontSize
                  : Math.min(commonValueFontSize, fittedFontSize);
            }
          });

          if (commonValueFontSize != null) {
            sectionValueAutoFitEntries.forEach(function (entry) {
              entry.valueElement.style.fontSize = commonValueFontSize + "px";
              entry.valueElement.style.display = "block";
              entry.valueElement.style.width = "100%";
              entry.valueElement.style.textAlign = "center";
              entry.valueElement.style.margin = "0";
              entry.valueElement.style.whiteSpace = "nowrap";
              entry.valueElement.style.fontVariantNumeric = "tabular-nums";
              entry.valueElement.style.fontFeatureSettings = '"tnum" 1';
            });
          }
        }

        if (isAutoFitEnabled && sectionUnitAutoFitEntries.length > 0) {
          var commonUnitFontSize = null;
          sectionUnitAutoFitEntries.forEach(function (entry) {
            $scope.fitCountDownTextToBox(
              entry.unitElement,
              entry.boxWidth,
              entry.unitHeight,
              entry.unitMin,
              entry.unitMax
            );

            var fittedUnitFontSize = parseFloat(
              window.getComputedStyle(entry.unitElement).fontSize
            );
            if (!isNaN(fittedUnitFontSize)) {
              commonUnitFontSize =
                commonUnitFontSize == null
                  ? fittedUnitFontSize
                  : Math.min(commonUnitFontSize, fittedUnitFontSize);
            }
          });

          if (commonUnitFontSize != null) {
            sectionUnitAutoFitEntries.forEach(function (entry) {
              entry.unitElement.style.fontSize = commonUnitFontSize + "px";
              entry.unitElement.style.display = "block";
              entry.unitElement.style.width = "100%";
              entry.unitElement.style.textAlign = "center";
              entry.unitElement.style.margin = "0";
              entry.unitElement.style.whiteSpace = "nowrap";
            });
          }
        }

        if (countDownEventName != undefined) {
          var eventTextTarget = countDownEventText || countDownEventName;
          eventTextTarget.style.color = labelFormat.fontColor;
          eventTextTarget.style.fontFamily = labelFormat.fontFamily;
          eventTextTarget.style.textAlign = labelFormat.alignment;

          if (isAutoFitEnabled) {
            var eventStyle = window.getComputedStyle(countDownEventName);
            var eventPaddingLeft = parseFloat(eventStyle.paddingLeft) || 0;
            var eventPaddingRight = parseFloat(eventStyle.paddingRight) || 0;
            var eventPaddingTop = parseFloat(eventStyle.paddingTop) || 0;
            var eventPaddingBottom = parseFloat(eventStyle.paddingBottom) || 0;
            $scope.fitCountDownTextToBox(
              eventTextTarget,
              Math.max(
                0,
                countDownEventName.clientWidth - eventPaddingLeft - eventPaddingRight
              ),
              Math.max(
                0,
                countDownEventName.clientHeight - eventPaddingTop - eventPaddingBottom
              ),
              8,
              300
            );
          } else {
            eventTextTarget.style.fontSize = (labelFormat.fontSize || 12) + "px";
          }
        }
      }
    };

    $scope.initializeCountDown = function (countDownWidget) {
      $timeout(function () {
        $scope.updateCountDownFontSize(countDownWidget);
      }, 200);

      if (countDownWidget.data.countDownWidget != undefined) {
        $scope.updateInterval(countDownWidget);
      }
    };

    $scope.updateInterval = function (countDownWidget) {
      for (var i = 0; i < $scope.countdownWidgetInterval.length; i++) {
        if (
          $scope.countdownWidgetInterval[i].widgetId ==
          countDownWidget.widgetSettingId
        ) {
          $interval.cancel($scope.countdownWidgetInterval[i].intervalObject);
          $scope.countdownWidgetInterval.splice(i, 1);
          break;
        }
      }
      var countDownInterval = $interval(function () {
        $scope.updateCountDownTime(countDownWidget);
      }, 1000);
      var countdownIntervalData = {
        intervalObject: countDownInterval,
        widgetId: countDownWidget.widgetSettingId,
      };
      $scope.countdownWidgetInterval.push(countdownIntervalData);
    };

    $scope.updateCountDownTime = function (countDownWidget) {
      var currentTimeInMillis = Date.now();
      var selectedEventTime = Date.parse(
        countDownWidget.data.countDownWidget.eventTime.replace(" ", "T")
      );
      var currentMillisecond = selectedEventTime - currentTimeInMillis;
      if (currentMillisecond > 0) {
        countDownWidget.data.timeDifference = currentMillisecond - 1000;
        var seconds = Math.floor(countDownWidget.data.timeDifference / 1000);
        var minutes = Math.floor(seconds / 60);
        var hours = Math.floor(minutes / 60);

        var days = Math.floor(hours / 24);
        hours = hours % 24;
        minutes = minutes % 60;
        seconds = seconds % 60;
        countDownWidget.data.days = days;
        countDownWidget.data.hours = hours;
        countDownWidget.data.minutes = minutes;
        countDownWidget.data.seconds = seconds;

        if (
          countDownWidget.widgetBackgroundSettingModel &&
          countDownWidget.widgetBackgroundSettingModel.autofit == true
        ) {
          var countDownSignature =
            String(countDownWidget.data.days).length +
            "-" +
            String(countDownWidget.data.hours).length +
            "-" +
            String(countDownWidget.data.minutes).length +
            "-" +
            String(countDownWidget.data.seconds).length;

          if (countDownWidget._countDownAutoFitSignature !== countDownSignature) {
            countDownWidget._countDownAutoFitSignature = countDownSignature;
            $timeout(function () {
              $scope.updateCountDownFontSize(countDownWidget);
            }, 0);
          }
        }
      } else {
        countDownWidget.data.days = 0;
        countDownWidget.data.hours = 0;
        countDownWidget.data.minutes = 0;
        countDownWidget.data.seconds = 0;

        if (
          countDownWidget.widgetBackgroundSettingModel &&
          countDownWidget.widgetBackgroundSettingModel.autofit == true
        ) {
          var zeroSignature = "1-1-1-1";
          if (countDownWidget._countDownAutoFitSignature !== zeroSignature) {
            countDownWidget._countDownAutoFitSignature = zeroSignature;
            $timeout(function () {
              $scope.updateCountDownFontSize(countDownWidget);
            }, 0);
          }
        }

        for (var i = 0; i < $scope.countdownWidgetInterval.length; i++) {
          if (
            $scope.countdownWidgetInterval[i].widgetId ==
            countDownWidget.widgetSettingId
          ) {
            $interval.cancel($scope.countdownWidgetInterval[i].intervalObject);
            $scope.countdownWidgetInterval.splice(i, 1);
            break;
          }
        }
      }
    };

    $scope.updateTaskStatus = function (
      todoTask,
      widgetSettingId,
      key,
      pageIndex,
      widgetIndex,
      event,
      widgetType,
      selectedLabel,
      value
    ) {
      var labelId;
      if (selectedLabel != undefined) {
        labelId = selectedLabel.labelId;
        if (selectedLabel.role == "Family Group") {
          if ($scope.selectedFamilyLabel == null) {
            event.preventDefault();
            if (value.showError == true) {
              return;
            }
            value.showError = true;
            $timeout(function () {
              value.showError = false;
            }, 5000);
            $scope.choresErrorMessage =
              "Please choose a user before marking a task complete.";
            return;
          }
          labelId = $scope.selectedFamilyLabel.labelId;
        }
      }

      /* painted mode: the DEVICE throws its own confetti natively - the
       * portal's canvas burst here would only get baked into a capture
       * as frozen mid-air pieces */
      if (todoTask.status == true && window.mmPainted !== true) {
        realisticConfetti(
          event.clientX / window.innerWidth,
          event.clientY / window.innerHeight
        );
      }
      var isAllTaskCompleted = true;
      var todos = [];
      if (widgetType == "todo") {
        todos = $scope.groups[pageIndex].widgets[widgetIndex].data.todos;
      } else {
        todos =
          $scope.groups[pageIndex].widgets[widgetIndex].data.todos[key].data;
      }

      if (widgetType == "todo") {
        var projectId = todoTask.projectId;
        for (var i = 0; i < todos.length; i++) {
          if (todos[i].status == false && todos[i].projectId == projectId) {
            isAllTaskCompleted = false;
            break;
          }
        }
      } else {
        for (var i = 0; i < todos.length; i++) {
          if (todos[i].status == false) {
            isAllTaskCompleted = false;
            break;
          }
        }
      }

      if (isAllTaskCompleted && window.mmPainted !== true) {
        fireWorkConfetti();
      }

      var payload = {
        id: todoTask.id,
        projectId: todoTask.projectId,
        taskId: todoTask.taskId,
        todoAccountId: todoTask.todoAccountId,
        status: todoTask.status,
        labelId: labelId,
      };

      $http({
        method: "PUT",
        url: MANGO_MIRROR_CONSTANT.todoStatusUpdate,
        headers: {
          "Content-Type": "application/json",
          authtoken: $rootScope.authToken,
          "accept-language": "en-US, en; q = 0.8",
          source: "webApp",
        },
        data: payload,
      }).then(
        function (res) {},
        function (error) {
          console.log(error);
        }
      );
    };

    $scope.initializeCalendar = function (calendarwidget) {
      if (calendarwidget.data.type != "subscriptionError") {
        if (calendarwidget.status == "on") {
          $scope.heightLimit = calendarwidget.height - 80;
        }
      }

      /*
       * This function is used to update calendar data
       * after certain interval
       */

      if (calendarwidget.data.calendarRefreshTime > 0) {
        $scope.updateCalendarTimeout(calendarwidget);
      }

      $timeout(function () {
        $scope.updatedCalendarView(calendarwidget);
        if (window.mmPaintedNotify) {
          window.mmPaintedNotify(
            "socket",
            "calendar",
            calendarwidget && calendarwidget.widgetSettingId
          );
        }
      }, 400);
    };

    $scope.calendarData = {};
    $scope.updatedCalendarView = function (calendarwidget) {
      var calendarWidgetFormat = calendarwidget.data.calendarWidgetFormat;
      var timing = "";
      var location = "";

      if (calendarWidgetFormat == undefined) {
        return;
      }
      
      $scope.calendarEvents = [];
      if (
        (calendarWidgetFormat.calendarType == "Monthly" &&
          calendarWidgetFormat.m_scroll !== "Off") ||
        (calendarWidgetFormat.calendarType == "List" &&
          calendarWidgetFormat.listAllignment == "Horizontal") ||
        (calendarWidgetFormat.calendarType == "Yearly")  
      ) {
        angular.forEach(calendarwidget.data.events.data, function (value, key) {
          var breakDownEvents = $scope.checkAndGetUpdatedEvent(value);
          angular.forEach(breakDownEvents, function (eachEvent, key) {
            var event = {
              allDay: false,
              color: value.backgroundColor,
              end: eachEvent.end,
              start: eachEvent.start,
              title: value.title,
              location: "",
              timeAndLocation: "",
              imageUrl: "",
              imageResolution: value.imageResolution,
              isEventNameVisible: value.isEventNameVisible,
              isPhotoCalendar: value.isPhotoCalendar,
              eventType: value.eventType,
              calendarAccountId: value.calendarAccountId,
              calendarId: value.calendarId,
              icalAccountId: value.icalAccountId,
              eventStartDate: value.start,
              eventEndDate: value.end,
              fillDayWithFirstPhotoOnly: value.fillDayWithFirstPhotoOnly,
              imageSize: value.imageSize,
            };

            var eventStartTime = moment(eachEvent.start);
            var eventEndTime = moment(eachEvent.end);

            if (
              eventStartTime.hours() == 0 &&
              eventStartTime.minutes() == 0 &&
              eventEndTime.hours() == 0 &&
              eventEndTime.minutes() == 0
            ) {
              event["allDay"] = true;
            }

            if (value.startTime != null && value.startTime != "") {
              timing = value.startTime;
              if (calendarWidgetFormat.showEndDate) {
                if (value.endTime != undefined) {
                  timing = timing + " - " + value.endTime;
                }
              }

              if (value.location != null && value.location != "") {
                if (
                  calendarWidgetFormat.showLocation &&
                  calendarWidgetFormat.calendarType == "List"
                ) {
                  event["location"] = value.location;
                } else {
                  event["title"] = event["title"] + ", " + value.location;
                }
              }
              if (value.imageUrl != undefined) {
                if (
                  calendarWidgetFormat.calendarType == "Monthly" &&
                  event.fillDayWithFirstPhotoOnly == true
                ) {
                  event["display"] = "none";
                }
                event["imageUrl"] = value.imageUrl;
              }
            }

            if (
              calendarwidget.contentType == "mealplan" &&
              value.recipeUrl != undefined
            ) {
              event["recipeUrl"] = value.recipeUrl;
            }

            if (value.eventRecurrenceId != undefined) {
              event["eventRecurrenceId"] = value.eventRecurrenceId;
            }

            event["eventId"] = value.eventId;

            $scope.calendarEvents.push(event);
          });
        });
      } else {
        angular.forEach(calendarwidget.data.events.data, function (value, key) {
          var event = {
            allDay: false,
            color: value.backgroundColor,
            end: value.end,
            start: value.start,
            title: value.title,
            location: "",
            timeAndLocation: "",
            imageUrl: "",
            imageResolution: value.imageResolution,
            imageSize: value.imageSize,
            isEventNameVisible: value.isEventNameVisible,
            isPhotoCalendar: value.isPhotoCalendar,
            eventType: value.eventType,
            calendarAccountId: value.calendarAccountId,
            calendarId: value.calendarId,
            icalAccountId: value.icalAccountId,
            eventStartDate: value.start,
            eventEndDate: value.end,
            fillDayWithFirstPhotoOnly: value.fillDayWithFirstPhotoOnly,
            imageSize: value.imageSize,
          };
          if (calendarwidget.contentType == "mealplan") {
            event["imageUrl"] = null;
          }
          event["allDay"] = value.allDay == "true" ? true : false;

          if (value.startTime != null && value.startTime != "") {
            timing = value.startTime;
            if (calendarWidgetFormat.showEndDate) {
              if (value.endTime != undefined) {
                timing = timing + " - " + value.endTime;
              }
            }

            if (value.location != null && value.location != "") {
              if (calendarwidget.contentType == "mealplan") {
                event["location"] = value.location;
              } else {
                if (
                  calendarWidgetFormat.showLocation &&
                  calendarWidgetFormat.calendarType == "List"
                ) {
                  event["location"] = value.location;
                } else {
                  event["title"] = event["title"] + ", " + value.location;
                }
              }
            }
            if (value.imageUrl != undefined) {
              if (
                calendarwidget.contentType != "mealplan" &&
                calendarWidgetFormat.calendarType == "Monthly"
              ) {
                if (event.fillDayWithFirstPhotoOnly == true) {
                  event["display"] = "none";
                }
              }
              event["imageUrl"] = value.imageUrl;
            }
          }

          if (
            calendarwidget.contentType == "mealplan" &&
            value.recipeUrl != undefined
          ) {
            event["recipeUrl"] = value.recipeUrl;
          }

          if (value.eventRecurrenceId != undefined) {
            event["eventRecurrenceId"] = value.eventRecurrenceId;
          }

          event["eventId"] = value.eventId;
          $scope.calendarEvents.push(event);
        });
      }

      if (calendarWidgetFormat.calendarType == "Schedule") {
        if (calendarWidgetFormat.schedule_days_selection == "current_day") {
          $scope.drawFullCalendar(
            $scope.calendarEvents,
            "timeGrid",
            calendarWidgetFormat,
            calendarwidget.widgetSettingId,
            true,
            calendarwidget.data.user_language,
            calendarwidget.data.initial_date,
            calendarwidget.widgetBackgroundSettingModel,
            calendarwidget
          );
        } else {
          $scope.drawFullCalendar(
            $scope.calendarEvents,
            "timeGridWeek",
            calendarWidgetFormat,
            calendarwidget.widgetSettingId,
            true,
            calendarwidget.data.user_language,
            calendarwidget.data.initial_date,
            calendarwidget.widgetBackgroundSettingModel,
            calendarwidget
          );
        }
      } else if (calendarWidgetFormat.calendarType == "Weeks") {
        $scope.drawFullCalendar(
          $scope.calendarEvents,
          "dayGridWeek",
          calendarWidgetFormat,
          calendarwidget.widgetSettingId,
          true,
          calendarwidget.data.user_language,
          calendarwidget.data.initial_date,
          calendarwidget.widgetBackgroundSettingModel,
          calendarwidget
        );
      } else if (calendarWidgetFormat.calendarType == "List") {
        if (calendarwidget.contentType == "mealplan") {
          $scope.drawFullCalendar(
            $scope.calendarEvents,
            "timeline",
            calendarWidgetFormat,
            calendarwidget.widgetSettingId,
            true,
            calendarwidget.data.user_language,
            calendarwidget.data.initial_date,
            calendarwidget.widgetBackgroundSettingModel,
            calendarwidget
          );
        } else {
          $scope.drawFullCalendar(
            $scope.calendarEvents,
            "timeline",
            calendarWidgetFormat,
            calendarwidget.widgetSettingId,
            true,
            calendarwidget.data.user_language,
            calendarwidget.data.initial_date,
            calendarwidget.widgetBackgroundSettingModel,
            calendarwidget
          );
        }
      } else if (calendarWidgetFormat.calendarType == "Monthly") {
        $scope.numberOfEventShowInSingleTime = 0;

        // Check for horizontal multi-month view
          $scope.drawFullCalendar(
	        $scope.calendarEvents,
	        "dayGridMonth",
	        calendarWidgetFormat,
	        calendarwidget.widgetSettingId,
	        true,
	        calendarwidget.data.user_language,
	        calendarwidget.data.initial_date,
	        calendarwidget.widgetBackgroundSettingModel,
	        calendarwidget
	      );
      } else if (calendarWidgetFormat.calendarType == "Yearly") {
          $scope.numberOfEventShowInSingleTime = 0;
          // Check for horizontal multi-month view
          if (calendarWidgetFormat.multiMonthView == "month_strip") {
            $scope.renderHorizontalWithFC(
              $scope.calendarEvents,
              calendarWidgetFormat,
              calendarwidget,
              calendarwidget.data.initial_date
            );
          }else if (calendarWidgetFormat.multiMonthView == "month_grid" || calendarWidgetFormat.multiMonthView == "timeline") {
        	  $scope.drawFullCalendar(
		        $scope.calendarEvents,
		        "dayGridMonth",
		        calendarWidgetFormat,
		        calendarwidget.widgetSettingId,
		        true,
		        calendarwidget.data.user_language,
		        calendarwidget.data.initial_date,
		        calendarwidget.widgetBackgroundSettingModel,
		        calendarwidget
		      );
          }
        }
    };

    $scope.completeOtherCalendarResizing = function () {
      var eventscontainer = document.querySelectorAll(".calendarEvent");
      if (eventscontainer.length > 0) {
        $timeout(function () {
          $(".calendarEvent").textfill({
            maxFontPixels: 200,
            debug: true,
            complete: function () {
              var events_container =
                document.querySelectorAll(".events_container");
              var minFontSize = parseInt(
                events_container[0].style.fontSize,
                10
              );
              if (isNaN(minFontSize)) {
                $scope.completeOtherCalendarResizing();
                return;
              }

              for (var i = 1; i < events_container.length; i++) {
                var fontSize = parseInt(events_container[i].style.fontSize, 10);
                var data = events_container[i].innerText;
                if (data != "") {
                  if (minFontSize > fontSize) {
                    minFontSize = fontSize;
                  }
                }
              }

              var events_container_height = document.querySelectorAll(
                ".calendarEventHeight"
              );
              var calendar_circle_element =
                document.querySelectorAll(".circle_image");

              for (var i = 0; i < events_container.length; i++) {
                events_container[i].style.lineHeight =
                  minFontSize * 1.254901961 + "px";
                events_container[i].style.height =
                  minFontSize * 1.254901961 + "px";
                events_container[i].style.fontSize = minFontSize + "px";
              }

              for (var i = 0; i < events_container_height.length; i++) {
                events_container_height[i].style.height =
                  minFontSize * 1.254901961 + "px";
              }

              for (var i = 0; i < calendar_circle_element.length; i++) {
                calendar_circle_element[i].style.marginTop =
                  -(minFontSize / 4) + "px";
                calendar_circle_element[i].style.lineHeight =
                  minFontSize * 1.254901961 + "px";
                calendar_circle_element[i].style.fontSize =
                  minFontSize / 2 + "px";
              }

              $scope.calendarCharacterLength = 500;
            },
          });
        }, 100);
      } else {
        $timeout(function () {
          $scope.completeOtherCalendarResizing();
        }, 100);
      }
    };

    $scope.updateIcalEvent = function (calendarwidget) {
      if($scope.isChildDisplay == true){
  		  return
  	  }
    	
      $http({
        method: "GET",
        url:
          MANGO_MIRROR_CONSTANT.icalEventUpdate +
          $scope.userId +
          "/" +
          calendarwidget.widgetSettingId,
        headers: {
          "Content-Type": "application/json",
          authtoken: $rootScope.authToken,
          "accept-language": "en-US, en; q = 0.8",
          source: "webApp",
        },
      }).then(
        function (res) {},
        function (error) {
          console.log(error);
        }
      );
    };

/*    $scope.updateTodoEvent = function (todowidget, source) {
      
      if($scope.isChildDisplay == true){
  		  return
  	  }
    	
      $http({
        method: "PUT",
        url:
          MANGO_MIRROR_CONSTANT.todoEventUpdate +
          $scope.userId +
          "/" +
          todowidget.widgetSettingId +
          "/" +
          source,
        headers: {
          "Content-Type": "application/json",
          authtoken: $rootScope.authToken,
          "accept-language": "en-US, en; q = 0.8",
          source: "webApp",
        },
      }).then(
        function (res) {},
        function (error) {
          console.log(error);
        }
      );
    };
*/
    $scope.refreshTodoData = function (todowidget) {
      $http({
        method: "PUT",
        url:
          MANGO_MIRROR_CONSTANT.todoDataRefresh +
          $scope.userId +
          "/" +
          todowidget.widgetSettingId,
        headers: {
          "Content-Type": "application/json",
          authtoken: $rootScope.authToken,
          "accept-language": "en-US, en; q = 0.8",
          source: "webApp",
        },
      }).then(
        function (res) {},
        function (error) {
          console.log(error);
        }
      );
    };

    $scope.getUpdatedCalendar = function (calendarWidgetDetail) {
      try {
		  
    	if($scope.isChildDisplay == true){
    		return;
		}
    	  
        $scope.requestCalendarModel = {
          userId: $scope.userId,
          deviceId: $scope.macaddress,
          refreshCalendarData: true,
          widgetSettingId: calendarWidgetDetail.widgetSettingId,
        };

        APIServices.getPortalRefreshedData($scope.requestCalendarModel)
          .success(function (data, status) {
            console.log("callendar call was successfull");
          })
          .error(function (data, status) {
            console.log("callendar call was unsuccessfull");
          });
      } catch (e) {
        console.log("Something went wrong");
      }
    };

    $scope.getCalendarData = function (calendarWidgetDetail, requestedDate) {
      try {
    	  
    	if($scope.isChildDisplay == true){
      		return;
  		}
    	  
        $scope.requestCalendarModel = {
          widgetSettingId: calendarWidgetDetail.widgetSettingId,
          calendarLastInitializedDate: requestedDate,
        };

        $rootScope.showLoadingSpinner(
          calendarWidgetDetail.widgetSettingId,
          "Loading..."
        );

        APIServices.requestedCalendarData($scope.requestCalendarModel)
          .success(function (data, status) {
            $timeout(function () {
              $rootScope.hideLoadingSpinner(
                calendarWidgetDetail.widgetSettingId
              );
            }, 2500);
          })
          .error(function (data, status) {
            $timeout(function () {
              $rootScope.hideLoadingSpinner(
                calendarWidgetDetail.widgetSettingId
              );
            }, 2500);
          });
      } catch (e) {
        $timeout(function () {
          $rootScope.hideLoadingSpinner(calendarWidgetDetail.widgetSettingId);
        }, 2500);
      }
    };

    $scope.clockIntervalFlag = false;
    $scope.isClockInitializationRequired = true;

    $scope.checkIfClockSettingAdded = function (widgetData) {
      for (var i = 0; i < $scope.clockWidgetList.length; i++) {
        if ($scope.clockWidgetList[i].widgetId == widgetData.widgetSettingId) {
          return true;
        }
      }
      return false;
    };

    $scope.getClockDummyData = function (data) {
      var time = "08:00";
      const [hours, minutes] = time.split(":").map(Number);

      // Create a Date object with today's date and the given time
      const date = new Date();
      date.setHours(hours);
      date.setMinutes(minutes);

      var timeFormat = {
        hour: "2-digit",
        minute: "2-digit",
        hour12: !data.hour24Format,
      };
      const formatter = new Intl.DateTimeFormat(data.user_language, timeFormat);

      if (typeof formatter.formatToParts === "function") {
        var parts = formatter.formatToParts(date);
        return parts
          .filter((part) => data.isMeridiemEnabled || part.type !== "dayPeriod")
          .map((part) => part.value)
          .join("");
      } else {
        if (!String.prototype.padStart) {
          String.prototype.padStart = function (targetLength, padString) {
            padString = padString || " ";
            if (this.length >= targetLength) return this;
            return padString.repeat(targetLength - this.length) + this;
          };
        }
        const pad = (num) => num.toString().padStart(2, "0");

        var formattedTime = formatter.format(date);
        if (!data.isMeridiemEnabled) {
          formattedTime = formattedTime
            .replace(
              /\s?(AM|PM|am|pm|A\.M\.|P\.M\.|a\.m\.|p\.m\.|पूर्वाह्न|अपराह्न|午前|午後)/,
              ""
            )
            .trim();
        }

        const match = formattedTime.match(/^(\D*)(\d{1,2}):(\d{2})(.*)$/);
        if (match) {
          const prefix = match[1]; // e.g., 午前
          const hour = pad(match[2]);
          const minute = match[3];
          const suffix = match[4];
          formattedTime = `${prefix}${hour}:${minute}${suffix}`.trim();
        }

        return formattedTime;
      }
    };

    $scope.mapClockData = function (widgetData, index, widgetIndex) {
      widgetData.data.dummyClockData = $scope.getClockDummyData(
        widgetData.data
      );
      var clockWidget = {
        widgetId: widgetData.widgetSettingId,
        widgetSetting: widgetData,
        pagenumber: [index],
        intervalObject: "",
        widgetIndexKey: [{ pagenumber: index, widgetIndexNumber: widgetIndex }],
      };

      var isDataFound = false;
      angular.forEach($scope.clockWidgetList, function (data) {
        if (data.widgetId == widgetData.widgetSettingId) {
          isDataFound = true;
          var widgetIndexObject = {
            pagenumber: index,
            widgetIndexNumber: widgetIndex,
          };
          data.pagenumber.push(index);
          data.widgetIndexKey.push(widgetIndexObject);
        }
      });
      if (isDataFound == false) {
        if (widgetData.data != null) {
          if (clockWidget.intervalObject != null) {
            $interval.cancel(clockWidget.intervalObject);
          }
          clockWidget.intervalObject = $scope.updateClockInterval(widgetData);
        }
        $scope.clockWidgetList.push(clockWidget);
      }
    };

    $scope.updateClockInterval = function (widgetData) {
      return $interval(function () {
        $scope.showClock(widgetData);
      }, 8000);
    };

    $scope.initClock = function (widgetData, index, innerIndex) {
      $scope.mapClockData(widgetData, index, innerIndex);
      $scope.showClock(widgetData);
      $scope.clockFontResize();
    };

    $scope.showClock = function (widgetData) {
      if (widgetData.data.type != "subscriptionError") {
        var time =
          new Date().getTime() + widgetData.data.timeZoneOffset * 60 * 1000;
        widgetData.data.dateDesc = new Intl.DateTimeFormat(
          widgetData.data.user_language,
          { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }
        ).format(new Date(time));
        widgetData.data.time = time;
        var timeFormat = {
          hour: "numeric",
          minute: "2-digit",
          hour12: !widgetData.data.hour24Format,
          timeZone: "UTC",
        };

        const formatter = new Intl.DateTimeFormat(
          widgetData.data.user_language,
          timeFormat
        );

        if (typeof formatter.formatToParts === "function") {
          const parts = formatter.formatToParts(new Date(time));
          widgetData.data.formatedTime = parts
            .filter(
              (part) =>
                widgetData.data.isMeridiemEnabled || part.type !== "dayPeriod"
            )
            .map((part) => part.value)
            .join("");
        } else {
          formattedTime = formatter.format(new Date(time));
          if (
            !widgetData.data.isMeridiemEnabled &&
            !widgetData.data.hour24Format
          ) {
            widgetData.data.formatedTime = formattedTime
              .replace(
                /\s?(AM|PM|am|pm|A\.M\.|P\.M\.|a\.m\.|p\.m\.|पूर्वाह्न|अपराह्न|午前|午後)/,
                ""
              )
              .trim();
          } else {
            widgetData.data.formatedTime = formattedTime;
          }
        }

        var greeting = widgetData.data.greeting;
        if (widgetData.data.userName != undefined) {
          greeting = greeting + ", " + widgetData.data.userName;
        }

        $scope.clockMessageStatus = widgetData.data.clockMessageStatus;
        $scope.checkGreeting(widgetData);
      }
    };

    $scope.checkGreeting = function (widgetData) {
      for (var i = 0; i < $scope.clockWidgetList.length; i++) {
        if ($scope.clockWidgetList[i].widgetId == widgetData.widgetSettingId) {
          for (
            var j = 0;
            j < $scope.clockWidgetList[i].widgetIndexKey.length;
            j++
          ) {
            var widgetIndexObject = $scope.clockWidgetList[i].widgetIndexKey[j];
            $scope.groups[widgetIndexObject.pagenumber].widgets[
              widgetIndexObject.widgetIndexNumber
            ].data.time = widgetData.data.time;
            $scope.groups[widgetIndexObject.pagenumber].widgets[
              widgetIndexObject.widgetIndexNumber
            ].data.formatedTime = widgetData.data.formatedTime;

            $scope.duration = moment.duration(widgetData.data.time);
            $scope.hours = $scope.duration.hours();

            var greetingKey = "";

            if ($scope.hours >= 4 && $scope.hours < 12) {
              greetingKey = widgetData.data.user_language + "_MORNING_GREETING";
            }
            if ($scope.hours >= 12 && $scope.hours < 16) {
              greetingKey =
                widgetData.data.user_language + "_AFTERNOON_GREETING";
            }
            if ($scope.hours >= 16 && $scope.hours < 22) {
              greetingKey = widgetData.data.user_language + "_EVENING_GREETING";
            }
            if ($scope.hours >= 22 || $scope.hours < 4) {
              greetingKey = widgetData.data.user_language + "_HELLO_GREETING";
            }
            var greeting = MANGO_MIRROR_CONSTANT[greetingKey];
            if (widgetData.data.userName != undefined) {
              greeting = greeting + ", " + widgetData.data.userName;
            }
            $scope.groups[widgetIndexObject.pagenumber].widgets[
              widgetIndexObject.widgetIndexNumber
            ].data.greeting = greeting;
          }

          break;
        }
      }
    };

    $scope.updateQuotesApi = function () {
      var quotesWidgetSettingId = [];
      angular.forEach($scope.quoteWidgetList, function (data) {
        quotesWidgetSettingId.push(data.widgetId);
      });

      var quotesWidgetIds = quotesWidgetSettingId.toString();

      $http({
        method: "PUT",
        url: MANGO_MIRROR_CONSTANT.quotesRefresh + "/" + quotesWidgetIds,
        headers: {
          "Content-Type": "application/json",
          authtoken: $rootScope.authToken,
          "accept-language": "en-US, en; q = 0.8",
          source: "webApp",
        },
      }).then(
        function (res) {},
        function (error) {
          console.log(error);
        }
      );
    };

    $scope.mapQuotesData = function (widgetData, index, widgetIndex) {
      var quoteWidget = {
        widgetId: widgetData.widgetSettingId,
        widgetSetting: widgetData,
        pagenumber: [index],
        intervalObject: "",
        widgetIndexKey: [{ pagenumber: index, widgetIndexNumber: widgetIndex }],
      };

      var isDataFound = false;
      angular.forEach($scope.quoteWidgetList, function (data) {
        if (data.widgetId == widgetData.widgetSettingId) {
          isDataFound = true;
          var widgetIndexObject = {
            pagenumber: index,
            widgetIndexNumber: widgetIndex,
          };
          data.pagenumber.push(index);
          data.widgetIndexKey.push(widgetIndexObject);
        }
      });

      if (isDataFound == false) {
        $scope.quoteWidgetList.push(quoteWidget);
      }

      if ($scope.quoteWidgetList.length > 0) {
        if ($scope.quotesInterval != undefined) {
          $interval.cancel($scope.quotesInterval);
        }

        $scope.quotesInterval = $interval(function () {
          $scope.updateQuotesApi();
        }, 1800000);
      }
    };

    $scope.mapNewsData = function (widgetData, index, widgetIndex) {
      var newsWidget = {
        widgetId: widgetData.widgetSettingId,
        widgetSetting: widgetData,
        pagenumber: [index],
        newsCycle: 0,
        widgetIndexKey: [{ pagenumber: index, widgetIndexNumber: widgetIndex }],
      };

      var isDataFound = false;
      angular.forEach($scope.newsWidgetList, function (data) {
        if (data.widgetId == widgetData.widgetSettingId) {
          isDataFound = true;
          var widgetIndexObject = {
            pagenumber: index,
            widgetIndexNumber: widgetIndex,
          };
          data.pagenumber.push(index);
          data.widgetIndexKey.push(widgetIndexObject);
        }
      });

      if (isDataFound == false) {
        $scope.newsWidgetList.push(newsWidget);
      }
    };

    $scope.initNews = function (widgetData, pageIndex, widgetIndex) {
      $scope.mapNewsData(widgetData, pageIndex, widgetIndex);
      $scope.resizeNewsFont();
    };

    $scope.initQuotes = function (widgetData, pageIndex, widgetIndex) {
      $scope.mapQuotesData(widgetData, pageIndex, widgetIndex);
      $scope.resizeQuotesFont();
    };

    $scope.loadNoBleData = function () {
      $scope.userMirrorModel = {
        user: { id: $scope.userId },
        mirror: { deviceId: $scope.macaddress },
      };

      $scope.NoBleDataModel = {
        userMirrorModel: $scope.userMirrorModel,
        isCurrentWeatherOn: $scope.isCurrentWeatherOn,
        isDailyWeatherOn: $scope.isDailyWeatherOn,
        is24HourWeatherOn: $scope.is24HourWeatherOn,
      };

      APIServices.noBleDataUpdate($scope.NoBleDataModel)
        .success(function (data, status) {
          var obj = data.object;
          if (obj.refreshWeather != undefined) {
            $scope.updateWeatherData(obj.refreshWeather);
          }
        })
        .error(function (data, status) {
          console.log("There are some issues while submitting logs");
        });
    };

    $scope.trustHtml = function (widgetData) {
      var data = window.twemoji.parse(widgetData.data.htmlContent);
      return $sce.trustAsHtml(data);
    };

    $scope.graphObjectArray = [];
    $scope.fontSize = 13;
    $scope.loadStackedGraph = function (canvasId, canvasValue) {
      var myLine = null;
      var ctx = document.getElementById(canvasId).getContext("2d");
      var stepdata = canvasValue;

      /*
       * if(myLine!=null) { myLine.clear(); }
       */

      // chart to draw curve on top of the bar chart

      if (stepdata.graphType == MANGO_MIRROR_CONSTANT.BAR_GRAPH_TYPE) {
        Chart.elements.Rectangle.prototype.draw = function () {
          var ctx = this._chart.ctx;
          var vm = this._view;
          var left, right, top, bottom, signX, signY, borderSkipped, radius;
          var borderWidth = vm.borderWidth;
          // Set Radius Here
          // If radius is large enough to cause
          // drawing errors a max radius is
          // imposed
          var cornerRadius = 100;

          if (!vm.horizontal) {
            // bar
            left = vm.x - vm.width / 2;
            right = vm.x + vm.width / 2;
            top = vm.y;
            bottom = vm.base;
            signX = 1;
            signY = bottom > top ? 1 : -1;
            borderSkipped = vm.borderSkipped || "bottom";
          } else {
            // horizontal bar
            left = vm.base;
            right = vm.x;
            top = vm.y - vm.height / 2;
            bottom = vm.y + vm.height / 2;
            signX = right > left ? 1 : -1;
            signY = 1;
            borderSkipped = vm.borderSkipped || "left";
          }

          // Canvas doesn't allow us to stroke
          // inside the width so we can
          // adjust the sizes to fit if we're
          // setting a stroke on the line
          if (borderWidth) {
            // borderWidth shold be less than
            // bar width and bar height.
            var barSize = Math.min(
              Math.abs(left - right),
              Math.abs(top - bottom)
            );
            borderWidth = borderWidth > barSize ? barSize : borderWidth;
            var halfStroke = borderWidth / 2;
            // Adjust borderWidth when bar top
            // position is near vm.base(zero).
            var borderLeft =
              left + (borderSkipped !== "left" ? halfStroke * signX : 0);
            var borderRight =
              right + (borderSkipped !== "right" ? -halfStroke * signX : 0);
            var borderTop =
              top + (borderSkipped !== "top" ? halfStroke * signY : 0);
            var borderBottom =
              bottom + (borderSkipped !== "bottom" ? -halfStroke * signY : 0);
            // not become a vertical line?
            if (borderLeft !== borderRight) {
              top = borderTop;
              bottom = borderBottom;
            }
            // not become a horizontal line?
            if (borderTop !== borderBottom) {
              left = borderLeft;
              right = borderRight;
            }
          }

          ctx.beginPath();
          ctx.fillStyle = vm.backgroundColor;
          ctx.strokeStyle = vm.borderColor;
          ctx.lineWidth = borderWidth;

          // Corner points, from bottom-left to
          // bottom-right clockwise
          // | 1 2 |
          // | 0 3 |

          var corners = [
            [left, bottom],
            [left, top],
            [right, top],
            [right, bottom],
          ];

          // Find first (starting) corner with
          // fallback to 'bottom'
          var borders = ["bottom", "left", "top", "right"];
          var startCorner = borders.indexOf(borderSkipped, 0);
          if (startCorner === -1) {
            startCorner = 0;
          }

          function cornerAt(index) {
            return corners[(startCorner + index) % 4];
          }

          // Draw rectangle from 'startCorner'

          var corner = cornerAt(0);
          ctx.moveTo(corner[0], corner[1]);

          for (var i = 1; i < 4; i++) {
            nextCornerId = i + 1;
            if (nextCornerId == 4) {
              nextCornerId = 0;
            }

            nextCorner = cornerAt(nextCornerId);

            width = corners[2][0] - corners[1][0];
            height = corners[0][1] - corners[1][1];
            x = corners[1][0];
            y = corners[1][1];

            var radius = cornerRadius;

            // Fix radius being too large
            if (radius > height / 2) {
              radius = height / 2;
            }
            if (radius > width / 2) {
              radius = width / 2;
            }

            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(
              x + width,
              y + height,
              x + width - radius,
              y + height
            );
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);

            if (
              ctx.canvas.attributes.graphType.nodeValue ==
                MANGO_MIRROR_CONSTANT.WIDGET_TYPE_HEART_RATE ||
              ctx.canvas.attributes.graphType.nodeValue ==
                MANGO_MIRROR_CONSTANT.WIDGET_TYPE_BLOOD_PRESSURE_SYSTOLIC
            ) {
              ctx.moveTo(x + radius, y);
              ctx.lineTo(x + width - radius, y);
              ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
              ctx.lineTo(x + width, y + height - radius);
              ctx.quadraticCurveTo(
                x + width,
                y + height,
                x + width - radius,
                y + height
              );
              ctx.lineTo(x + radius, y + height);
              ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
              ctx.lineTo(x, y + radius);
              ctx.quadraticCurveTo(x, y, x + radius, y);
            } else if (
              ctx.canvas.attributes.graphType.nodeValue ==
                MANGO_MIRROR_CONSTANT.WIDGET_PRODUCTIVITY_BY_PERCENTAGE ||
              ctx.canvas.attributes.graphType.nodeValue ==
                MANGO_MIRROR_CONSTANT.WIDGET_PRODUCTIVITY_BY_TIME ||
              ctx.canvas.attributes.graphType.nodeValue ==
                MANGO_MIRROR_CONSTANT.WIDGET_CATEGORY_BY_PERCENTAGE ||
              ctx.canvas.attributes.graphType.nodeValue ==
                MANGO_MIRROR_CONSTANT.WIDGET_CATEGORY_BY_TIME
            ) {
              ctx.moveTo(x + radius, y);
              ctx.lineTo(x + width, y);
              ctx.quadraticCurveTo(x + width, y, x + width, y);
              ctx.lineTo(x + width, y + height);
              ctx.quadraticCurveTo(
                x + width,
                y + height,
                x + width,
                y + height
              );
              ctx.lineTo(x + radius, y + height);
              ctx.quadraticCurveTo(x, y + height, x, y + height);
              ctx.lineTo(x, y + radius);
              ctx.quadraticCurveTo(x, y, x, y);
            } else {
              ctx.moveTo(x + radius, y);
              ctx.lineTo(x + width - radius, y);
              ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
              ctx.lineTo(x + width, y + height);
              ctx.quadraticCurveTo(
                x + width,
                y + height,
                x + width,
                y + height
              );
              ctx.lineTo(x + radius, y + height);
              ctx.quadraticCurveTo(x, y + height, x, y + height);
              ctx.lineTo(x, y + radius);
              ctx.quadraticCurveTo(x, y, x + radius, y);
            }
          }

          ctx.fill();
          if (borderWidth) {
            ctx.stroke();
          }
        };
      }

      // end code for curved graph

      var maxGraphValue = stepdata.data.maxValue;
      var minGraphValue = stepdata.data.minValue;
      var checkMinGraph = false;
      if (minGraphValue == 0) {
        checkMinGraph = true;
      }

      var goalValue = stepdata.data.goalValue;
      var scaleStepWidth;
      ctx.canvas.width = stepdata.width;
      ctx.canvas.height = (stepdata.height * 65) / 100;
      var checkForValueModification = 0;

      var maxValue;

      if (maxGraphValue > 0) {
        if (maxGraphValue >= 1000 || goalValue >= 1000) {
          maxGraphValue = maxGraphValue / 1000;
          if (goalValue > 0) {
            goalValue = goalValue / 1000;
          }

          checkForValueModification = 1;
          if (minGraphValue > 1000) {
            minGraphValue = minGraphValue / 1000;
          } else {
            minGraphValue = 0;
          }
        }
      }

      if (stepdata.data.maxValue > 1000) {
        if (goalValue > maxGraphValue) {
          maxValue = goalValue + 1;
        } else {
          maxValue = maxGraphValue + 1;
        }
        if (stepdata.graphType == MANGO_MIRROR_CONSTANT.BAR_GRAPH_TYPE) {
          minGraphValue = 0;
        }
      } else {
        if (
          stepdata.contentType ==
            MANGO_MIRROR_CONSTANT.WIDGET_TYPE_HEART_RATE ||
          stepdata.contentType ==
            MANGO_MIRROR_CONSTANT.WIDGET_TYPE_BLOOD_PRESSURE_SYSTOLIC
        ) {
          maxValue = maxGraphValue - (maxGraphValue % 10) + 20;
        } else {
          if (stepdata.graphType == MANGO_MIRROR_CONSTANT.BAR_GRAPH_TYPE) {
            minGraphValue = 0;
          }
          if (maxGraphValue >= 2) {
            maxValue = maxGraphValue;
          } else {
            maxValue = 2;
          }
        }
      }

      if (checkForValueModification == 1) {
        $scope.tempStepData = [];
        angular.forEach(stepdata.data.datasets[0].data, function (data) {
          var currentDateData = null;
          var data = Math.round((data / 1000) * 100) / 100;
          $scope.tempStepData.push(data);
        });
        stepdata.data.datasets[0].data = $scope.tempStepData;

        if (
          stepdata.contentType ==
            MANGO_MIRROR_CONSTANT.WIDGET_TYPE_HEART_RATE ||
          stepdata.contentType ==
            MANGO_MIRROR_CONSTANT.WIDGET_TYPE_BLOOD_PRESSURE_SYSTOLIC
        ) {
          $scope.tempStepData = [];
          angular.forEach(stepdata.data.datasets[1].data, function (data) {
            var currentDateData = null;
            var data = Math.round((data / 1000) * 100) / 100;
            $scope.tempStepData.push(data);
          });
          stepdata.data.datasets[1].data = $scope.tempStepData;
        }

        stepdata.data.goalValue = goalValue;
        stepdata.data.maxValue = maxGraphValue;
        stepdata.data.minValue = minGraphValue;
      }

      if (checkForValueModification == 1) {
        if (
          stepdata.contentType ==
            MANGO_MIRROR_CONSTANT.WIDGET_TYPE_HEART_RATE ||
          stepdata.contentType ==
            MANGO_MIRROR_CONSTANT.WIDGET_TYPE_BLOOD_PRESSURE_SYSTOLIC
        ) {
          scaleStepWidth = (maxValue - Math.floor(minGraphValue)) / 1;
        } else {
          if (stepdata.data.maxValue - stepdata.data.minValue > 0) {
            scaleStepWidth =
              (stepdata.data.maxValue - stepdata.data.minValue) / 2;
          } else {
            scaleStepWidth = (maxValue - Math.floor(minGraphValue)) / 2;
          }
        }
      } else {
        if (maxValue == 0) {
          scaleStepWidth = 1;
          minGraphValue = 0;
        } else {
          if (
            stepdata.contentType ==
              MANGO_MIRROR_CONSTANT.WIDGET_TYPE_HEART_RATE ||
            stepdata.contentType ==
              MANGO_MIRROR_CONSTANT.WIDGET_TYPE_BLOOD_PRESSURE_SYSTOLIC ||
            stepdata.contentType ==
              MANGO_MIRROR_CONSTANT.WIDGET_PRODUCTIVITY_BY_PERCENTAGE ||
            stepdata.contentType ==
              MANGO_MIRROR_CONSTANT.WIDGET_PRODUCTIVITY_BY_TIME ||
            stepdata.contentType ==
              MANGO_MIRROR_CONSTANT.WIDGET_CATEGORY_BY_PERCENTAGE ||
            stepdata.contentType ==
              MANGO_MIRROR_CONSTANT.WIDGET_CATEGORY_BY_TIME
          ) {
            scaleStepWidth = (maxValue - Math.floor(minGraphValue)) / 1;
          } else {
            scaleStepWidth = (maxValue - Math.floor(minGraphValue)) / 2;
          }

          if (scaleStepWidth < 1) {
            scaleStepWidth = 1;
          }
        }
      }

      var horizonalLinePlugin = {
        initialize: function (data) {
          window.Chart.types.Bar.prototype.initialize.apply(this, arguments);
          var rectangleDraw = this.datasets[0].bars[0].draw;
          var self = this;
          var radius = this.datasets[0].bars[0].width * 0.3;
          // override the rectangle draw with
          // ours
          this.datasets.forEach(function (dataset) {
            dataset.bars.forEach(function (bar) {
              bar.draw = function () {
                var y = bar.y;
                bar.y = Math.min(bar.y + radius, self.scale.endPoint - 1);
                var barRadius = bar.y - y;
                rectangleDraw.apply(bar, arguments);
                window.Chart.helpers.drawRoundedRectangle(
                  self.chart.ctx,
                  bar.x - bar.width / 2,
                  bar.y - barRadius + 1,
                  bar.width,
                  bar.height,
                  barRadius
                );
                ctx.fill();
                bar.y = y;
              };
            });
          });
        },
        afterDraw: function (chartInstance) {
          var yScale = chartInstance.scales["y-axis-0"];
          var canvas = chartInstance.chart;
          var ctx = canvas.ctx;
          var index;
          var line;
          var style;

          if (chartInstance.options.horizontalLine) {
            for (
              index = 0;
              index < chartInstance.options.horizontalLine.length;
              index++
            ) {
              line = chartInstance.options.horizontalLine[index];

              if (line.y > 0) {
                style = "rgba(128,128,128, 0.5)";

                if (line.y) {
                  yValue = yScale.getPixelForValue(line.y);
                } else {
                  yValue = 0;
                }
                if (yValue) {
                  ctx.beginPath();
                  ctx.moveTo(45, yValue);
                  ctx.lineTo(canvas.width - 20, yValue);
                  ctx.strokeStyle = style;
                  ctx.lineWidth = 1;
                  ctx.stroke();
                  ctx.fillStyle = style;
                  ctx.font = "14px 'sourceSansPro-Light'";
                  if (line.isAppendNeeded) {
                    if (
                      ctx.canvas.attributes.graphType.nodeValue ==
                      MANGO_MIRROR_CONSTANT.WIDGET_TYPE_EXERCISE_CALORIES
                    ) {
                      ctx.fillText(Math.round(line.y), 2, yValue + 3);
                    } else {
                      var goalRoundOffValue = Math.round(line.y * 10) / 10;
                      ctx.fillText(goalRoundOffValue + " k", 2, yValue + 3);
                    }
                  } else {
                    if (
                      ctx.canvas.attributes.graphType.nodeValue ==
                        MANGO_MIRROR_CONSTANT.WIDGET_TYPE_TOTAL_MINUTES_ASLEEP ||
                      ctx.canvas.attributes.graphType.nodeValue ==
                        MANGO_MIRROR_CONSTANT.WIDGET_TYPE_TOTAL_TIMEINBED ||
                      ctx.canvas.attributes.graphType.nodeValue ==
                        MANGO_MIRROR_CONSTANT.WIDGET_TYPE_STAND ||
                      ctx.canvas.attributes.graphType.nodeValue ==
                        MANGO_MIRROR_CONSTANT.WIDGET_TYPE_EXERCISE_MINUTES
                    ) {
                      var str = line.y.toString();
                      ctx.fillText(str.replace(".", ":"), 2, yValue + 3);
                    } else {
                      var goalRoundOffValue = Math.round(line.y * 10) / 10;
                      ctx.fillText(goalRoundOffValue, 2, yValue + 3);
                    }
                  }
                }
              }
            }
            return;
          }
        },
      };

      var data = stepdata.data;
      var fixedstepsize = Math.ceil(scaleStepWidth);
      var stacked;
      var barpercentage;
      var padding;
      var maxStackedYaxisLimit;

      if (
        stepdata.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_HEART_RATE ||
        stepdata.contentType ==
          MANGO_MIRROR_CONSTANT.WIDGET_TYPE_BLOOD_PRESSURE_SYSTOLIC ||
        stepdata.contentType ==
          MANGO_MIRROR_CONSTANT.WIDGET_PRODUCTIVITY_BY_PERCENTAGE ||
        stepdata.contentType ==
          MANGO_MIRROR_CONSTANT.WIDGET_PRODUCTIVITY_BY_TIME ||
        stepdata.contentType ==
          MANGO_MIRROR_CONSTANT.WIDGET_CATEGORY_BY_PERCENTAGE ||
        stepdata.contentType == MANGO_MIRROR_CONSTANT.WIDGET_CATEGORY_BY_TIME
      ) {
        stacked = true;
        padding = 10;
        minGraphValue = Math.floor(minGraphValue);
        maxStackedYaxisLimit = minGraphValue + fixedstepsize * 1;
      } else {
        stacked = false;
        padding = 0;
        minGraphValue = Math.floor(minGraphValue);
        maxStackedYaxisLimit = minGraphValue + fixedstepsize * 2;
      }

      var xAxisScaleArrayList = [];
      var xAxisScaleobject;

      if (
        stepdata.contentType == MANGO_MIRROR_CONSTANT.WIDGET_TYPE_HEART_RATE ||
        stepdata.contentType ==
          MANGO_MIRROR_CONSTANT.WIDGET_TYPE_BLOOD_PRESSURE_SYSTOLIC
      ) {
        xAxisScaleobject = {
          stacked: stacked,
          ticks: { fontColor: "gray", padding: padding },
          barThickness: 19,
          gridLines: { display: false },
          afterFit: { height: 120 },
        };
        lagendDisplayStatus = false;
        xAxisScaleArrayList.push(xAxisScaleobject);
      } else if (
        stepdata.contentType ==
          MANGO_MIRROR_CONSTANT.WIDGET_PRODUCTIVITY_BY_PERCENTAGE ||
        stepdata.contentType ==
          MANGO_MIRROR_CONSTANT.WIDGET_PRODUCTIVITY_BY_TIME ||
        stepdata.contentType ==
          MANGO_MIRROR_CONSTANT.WIDGET_CATEGORY_BY_PERCENTAGE ||
        stepdata.contentType == MANGO_MIRROR_CONSTANT.WIDGET_CATEGORY_BY_TIME
      ) {
        lagendDisplayStatus = true;
        lagendreverseOrder = true;
        lagendPointerIcon = false;
        xAxisScaleobject = {
          stacked: stacked,
          ticks: { fontColor: "gray", padding: 2 },
          gridLines: { display: false },
          afterFit: { height: 120 },
        };
        xAxisScaleArrayList.push(xAxisScaleobject);
      } else {
        if (
          stepdata.contentType ==
          MANGO_MIRROR_CONSTANT.WIDGET_TYPE_BLOOD_GLUCOSE
        ) {
          lagendDisplayStatus = true;
          lagendPointerIcon = true;
        } else {
          lagendDisplayStatus = false;
          lagendPointerIcon = false;
        }
        xAxisScaleobject = {
          stacked: stacked,
          ticks: { fontColor: "gray", padding: padding },
          gridLines: { display: false },
          afterFit: { height: 120 },
        };
        xAxisScaleArrayList.push(xAxisScaleobject);
      }

      var chartType;
      var xAxisPadding = 0;
      if (stepdata.graphType == MANGO_MIRROR_CONSTANT.BAR_GRAPH_TYPE) {
        chartType = "bar";
      } else {
        chartType = "line";
        xAxisPadding = 20;
      }

      myLine = new Chart(ctx, {
        type: chartType,
        plugins: horizonalLinePlugin,
        data: data,
        options: {
          responsive: true,
          scaleSteps: 4,
          lineAt: stepdata.data.goalValue,
          horizontalLine: [
            {
              y: stepdata.data.goalValue,
              style: "rgba(128, 128, 128, 1)",
              isAppendNeeded: checkForValueModification,
            },
          ],
          scales: {
            xAxes: xAxisScaleArrayList,
            yAxes: [
              {
                stacked: stacked,
                gridLines: {
                  display: false,
                },
                ticks: {
                  min: minGraphValue,
                  padding: xAxisPadding,
                  stepSize: fixedstepsize,
                  max: maxStackedYaxisLimit,
                  fontColor: "gray",
                  callback: function (label, index, labels) {
                    if (
                      stepdata.contentType ==
                      MANGO_MIRROR_CONSTANT.WIDGET_TYPE_HEART_RATE
                    ) {
                      if (checkMinGraph) {
                        if (label == 0) {
                          return "No Data";
                        } else {
                          return label;
                        }
                      } else {
                        return label;
                      }
                    } else {
                      if (checkForValueModification == 1) {
                        if (
                          stepdata.contentType ==
                          MANGO_MIRROR_CONSTANT.WIDGET_TYPE_EXERCISE_CALORIES
                        ) {
                          return label;
                        } else {
                          return label + " k";
                        }
                      } else {
                        return label;
                      }
                    }
                  },
                },
              },
            ],
          },
          tooltips: {
            enabled: false,
          },
          events: [],
          animation: {
            onComplete: function () {
              var goalPriority = stepdata.goalPriority;
              var chartInstance = this.chart,
                ctx = chartInstance.ctx;
              ctx.textAlign = "center";
              ctx.fillStyle = "gray";
              ctx.textBaseline = "bottom";
              ctx.font =
                "normal 10px 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif";
              var dataset = this.data.datasets[0];

              if (stacked) {
                if (
                  stepdata.widgetMasterCategory !=
                  MANGO_MIRROR_CONSTANT.WIDGET_MASTER_CATEGORY_RESCUETIME
                ) {
                  var dataset1 = this.data.datasets[1];
                  var meta = chartInstance.controller.getDatasetMeta(0);
                  meta.data.forEach(function (bar, index) {
                    var data = Math.round(dataset.data[index] * 100) / 100;
                    if (data > 0) {
                      ctx.fillText(data, bar._model.x, bar._model.y + 15);
                    }
                  });
                  var meta = chartInstance.controller.getDatasetMeta(1);
                  meta.data.forEach(function (bar, index) {
                    var maxvalue = dataset.data[index] + dataset1.data[index];
                    var data = Math.round(maxvalue * 100) / 100;
                    if (data > 0) {
                      ctx.fillText(data, bar._model.x, bar._model.y - 5);
                    }
                  });
                }
              } else {
                var meta = chartInstance.controller.getDatasetMeta(0);
                meta.data.forEach(function (bar, index) {
                  var data = Math.round(dataset.data[index] * 100) / 100;
                  var maxvalue = dataset.data[index];
                  var maxYaxisHeight = bar._yScale.bottom;

                  if (
                    stepdata.graphType == MANGO_MIRROR_CONSTANT.BAR_GRAPH_TYPE
                  ) {
                    if (data > 0) {
                      var barHeight = bar.height();
                      var rounded = Math.round(data * 10) / 10;
                      ctx.fillStyle = "black";
                      if (checkForValueModification == 1) {
                        if (
                          stepdata.contentType ==
                          MANGO_MIRROR_CONSTANT.WIDGET_TYPE_EXERCISE_CALORIES
                        ) {
                          ctx.fillText(
                            Math.ceil(data + 0.5),
                            bar._model.x,
                            maxYaxisHeight
                          );
                        } else {
                          ctx.fillText(
                            rounded + " k",
                            bar._model.x,
                            maxYaxisHeight
                          );
                        }
                      } else {
                        if (
                          stepdata.contentType ==
                            MANGO_MIRROR_CONSTANT.WIDGET_TYPE_TOTAL_MINUTES_ASLEEP ||
                          stepdata.contentType ==
                            MANGO_MIRROR_CONSTANT.WIDGET_TYPE_TOTAL_TIMEINBED ||
                          stepdata.contentType ==
                            MANGO_MIRROR_CONSTANT.WIDGET_TYPE_STAND ||
                          stepdata.contentType ==
                            MANGO_MIRROR_CONSTANT.WIDGET_TYPE_EXERCISE_MINUTES
                        ) {
                          var str = data.toString();
                          var res = str.replace(".", ":");
                          ctx.fillText(res, bar._model.x, maxYaxisHeight);
                        } else {
                          ctx.fillText(rounded, bar._model.x, maxYaxisHeight);
                        }
                      }
                    }
                  }

                  if (stepdata.data.goalValue > 0) {
                    if (data >= stepdata.data.goalValue) {
                      var padding = maxYaxisHeight - bar._model.y;
                      if (padding > 26) {
                        if (goalPriority == "stay_up") {
                          if (
                            goalSuccessImage != null &&
                            goalSuccessImage.getAttribute("src") != undefined
                          ) {
                            ctx.drawImage(
                              goalSuccessImage,
                              bar._model.x - 9,
                              bar._model.y + 6,
                              20,
                              20
                            );
                          }
                        } else {
                          if (
                            goalFailureImage != null &&
                            goalFailureImage.getAttribute("src") != undefined
                          ) {
                            if (index != 6) {
                              ctx.drawImage(
                                goalFailureImage,
                                bar._model.x - 9,
                                bar._model.y + 6,
                                20,
                                20
                              );
                            }
                          }
                        }
                      } else {
                        var diff = 26 - padding;
                        if (goalPriority == "stay_up") {
                          if (
                            goalSuccessImage != null &&
                            goalSuccessImage.getAttribute("src") != undefined
                          ) {
                            ctx.drawImage(
                              goalSuccessImage,
                              bar._model.x - 9,
                              bar._model.y - diff,
                              20,
                              20
                            );
                          }
                        } else {
                          if (
                            goalFailureImage != null &&
                            goalFailureImage.getAttribute("src") != undefined
                          ) {
                            if (index != 6) {
                              ctx.drawImage(
                                goalFailureImage,
                                bar._model.x - 9,
                                bar._model.y - diff,
                                20,
                                20
                              );
                            }
                          }
                        }
                      }
                    } else {
                      var padding = maxYaxisHeight - bar._model.y;
                      if (padding > 26) {
                        if (goalPriority == "stay_up") {
                          if (
                            goalFailureImage != null &&
                            goalFailureImage.getAttribute("src") != undefined
                          ) {
                            if (index != 6) {
                              ctx.drawImage(
                                goalFailureImage,
                                bar._model.x - 9,
                                bar._model.y + 6,
                                20,
                                20
                              );
                            }
                          }
                        } else {
                          if (
                            goalSuccessImage != null &&
                            goalSuccessImage.getAttribute("src") != undefined
                          ) {
                            ctx.drawImage(
                              goalSuccessImage,
                              bar._model.x - 9,
                              bar._model.y + 6,
                              20,
                              20
                            );
                          }
                        }
                      } else {
                        var diff = 26 - padding;
                        if (goalPriority == "stay_up") {
                          if (
                            goalFailureImage != null &&
                            goalFailureImage.getAttribute("src") != undefined
                          ) {
                            if (index != 6) {
                              ctx.drawImage(
                                goalFailureImage,
                                bar._model.x - 9,
                                bar._model.y - diff,
                                20,
                                20
                              );
                            }
                          }
                        } else {
                          if (
                            goalSuccessImage != null &&
                            goalSuccessImage.getAttribute("src") != undefined
                          ) {
                            ctx.drawImage(
                              goalSuccessImage,
                              bar._model.x - 9,
                              bar._model.y - diff,
                              20,
                              20
                            );
                          }
                        }
                      }
                    }
                  }
                });
              }
            },
          },

          legend: {
            display: lagendDisplayStatus,
            position: "bottom",
            reverse: lagendreverseOrder,
            labels: {
              usePointStyle: lagendPointerIcon,
              filter: function (legendItem, chartData) {
                if (legendItem.text != undefined) {
                  return legendItem.text;
                }
              },
              boxWidth: 10,
            },
          },
        },
      });

      var results = $filter("filter")(
        $scope.graphObjectArray,
        {
          graphInstanceId: canvasId,
        },
        true
      );
      // graph not exists if its first time load, lets
      // push it
      if (results.length < 1) {
        $scope.graphObjectArray.push({
          graphInstanceId: canvasId,
          chartInstanceId: myLine,
        });
      }
    };

    $scope.updateData = function () {
      window.dispatchEvent(new Event("resize"));
    };

    $scope.counter = 5;
    $scope.flag = true;

    $scope.resize = function (evt, ui) {
      $scope.w = ui.size.width;
      $scope.h = ui.size.height;
    };

    $scope.addResizableIcon = function (elem) {
      var id = elem.attr("id");
      $("#" + id)
        .find(".ui-resizable-handle")
        .css("display", "block");
    };

    /*
     * this code is used to heilight widget border for 5
     * sec if ideal more than 5 sec then it will removed
     */

    $scope.removeFocus = function () {
      $scope.counter = 5;
      $scope.flag = false;
      $scope.startCountDown();
    };

    $scope.changeFocus = function (index) {
      if (
        $localStorage.lastindex != undefined &&
        index != $localStorage.lastindex
      ) {
        var lastindex = $localStorage.lastindex;
        $("#" + lastindex)
          .find(".ui-resizable-handle")
          .css("display", "none");
      }
      $("#" + index)
        .find(".ui-resizable-handle")
        .css("display", "block");
      $localStorage.lastindex = index;
      $scope.clearTimer();
      $scope.index = index;
      $scope.focus = index;
      $scope.bodyRange = true;
      $scope.currentIndex = index;
      $scope.startCountDown();
    };

    $scope.clearTimer = function () {
      $timeout.cancel(stopped);
      $scope.counter = 5;
    };

    var stopped;
    var updateSettingTimerId;
    $scope.startCountDown = function () {
      if (stopped) {
        $timeout.cancel(stopped);
      }
      stopped = $timeout(function () {
        $scope.counter--;
        if ($scope.counter == 0) {
          $scope.stopCountDown();
        } else {
          $scope.startCountDown();
        }
      }, 1000);
    };

    $scope.stopCountDown = function () {
      $timeout.cancel(stopped);
      $(".ui-resizable-handle").css("display", "none");
      $scope.index = -1;
      $scope.scroll = false;
      $scope.counter = 5;
      $scope.flag = true;
      $scope.bodyRange = false;
    };

    $scope.refreshNewsData = function () {
      if ($scope.newsArrayList.length > 0) {
        angular.forEach($scope.newsArrayList, function (data) {
          $scope.loadNewsDataByUrl(data, true, 1);
        });
      }
    };

    $scope.resizeIframilyHtmlEmbed = function (widgetData, index) {
      var iframily_ = document.getElementById(
        "iframily_" + widgetData.widgetSettingId + "_" + index
      );
      if (iframily_ == null) {
        return;
      }

      iframily_.style.height = widgetData.height + "px";
      iframily_.style.width = widgetData.width + "px";
      iframily_.style.overflow = "hidden";

      if (
        iframily_.firstChild != null &&
        iframily_.firstChild.children != undefined &&
        iframily_.firstChild.firstChild != null
      ) {
        iframily_.firstChild.firstChild.style.height = widgetData.height + "px";
        iframily_.firstChild.firstChild.style.width = widgetData.width + "px";
        iframily_.firstChild.firstChild.style.position = "unset";
        iframily_.firstChild.firstChild.style.padding = "0px";
      }

      var iframeElements = iframily_.querySelectorAll("iframe");
      angular.forEach(iframeElements, function (iframeElement) {
        iframeElement.style.height = widgetData.height + "px";
        iframeElement.style.width = widgetData.width + "px";
        iframeElement.style.maxHeight = widgetData.height + "px";
        iframeElement.style.maxWidth = widgetData.width + "px";
        iframeElement.setAttribute("height", widgetData.height + "px");
        iframeElement.setAttribute("width", widgetData.width + "px");
        iframeElement.style.border = "none";
      });
    };

    $scope.scheduleIframilyHtmlResize = function (widgetData, index) {
      angular.forEach([0, 500, 2000, 4000], function (delay) {
        $timeout(function () {
          try {
            $scope.resizeIframilyHtmlEmbed(widgetData, index);
          } catch (e) {
            console.log("some issue while resizing the widget");
          }
        }, delay);
      });
    };

    $scope.updateHtmlConetnt = function (htmlData, widgetData) {
      var i = 0;
      for (var i = 0; i < $scope.groups.length; i++) {
        for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
          widgerData = $scope.groups[i].widgets[j];
          if (widgerData.type != "subscriptionError") {
            if (
              $scope.groups[i].widgets[j].widgetSettingId ==
              widgetData.widgetSettingId
            ) {
              $scope.groups[i].widgets[j].data.htmlContent = htmlData;
              $scope.groups[i].widgets[j].data.isLoading = false;
              if ($scope.isMicrosoftOfficeS3Content($scope.groups[i].widgets[j])) {
                $scope.groups[i].widgets[j].data.iframilyHtmlLoaded = true;
                widgetData.data.iframilyHtmlLoaded = true;
              }
              if (
                widgetData.contentType != "embed_html" &&
                widgetData.contentType != "embed_website" &&
                $scope.quoteIndex == i
              ) {
                $scope.scheduleIframilyHtmlResize(widgetData, i);
              }
            }
            continue;
          }
        }
      }
    };

    $scope.resizeIframeWidget = function (index) {
      for (var i = 0; i < $scope.iframilyWidgetList.length; i++) {
        if ($scope.iframilyWidgetList[i].pagenumber.includes(index)) {
          if ($scope.isHtmlContent($scope.iframilyWidgetList[i].widgetSetting)) {
            if (
              $scope.isMicrosoftOfficeS3Content(
                $scope.iframilyWidgetList[i].widgetSetting
              )
            ) {
              $scope.loadIframilyDataIfNeeded(
                $scope.iframilyWidgetList[i].widgetSetting,
                index
              );
            } else {
              $scope.scheduleIframilyHtmlResize(
                $scope.iframilyWidgetList[i].widgetSetting,
                index
              );
            }
          } else if ($scope.isIframeContent($scope.iframilyWidgetList[i].widgetSetting)) {
            $scope.applyTransform($scope.iframilyWidgetList[i].widgetSetting);
          }
        }
      }
    };

    $scope.initializeAllIframeWidget = function () {
      for (var i = 0; i < $scope.iframilyWidgetList.length; i++) {
        for (var j = 0;j < $scope.iframilyWidgetList[i].pagenumber.length;j++) {
        	if(
              $scope.isHtmlContent($scope.iframilyWidgetList[i].widgetSetting) &&
              $scope.shouldLoadIframilyHtmlNow(
                $scope.iframilyWidgetList[i].widgetSetting,
                $scope.iframilyWidgetList[i].pagenumber[j]
              )
            ){
        		$scope.loadIframilyDataIfNeeded(
              $scope.iframilyWidgetList[i].widgetSetting,
              $scope.iframilyWidgetList[i].pagenumber[j]
            );	
        	}
        }
      }
    }
    
    $scope.checkAndRenderIframly = function(){
    	for (var i = 0; i < $scope.iframilyWidgetList.length; i++) {
        	if($scope.iframilyWidgetList[i].pagenumber.length>0 && $scope.iframilyWidgetList[i].pagenumber.includes($scope.quoteIndex)){
        		if($scope.isIframeContent($scope.iframilyWidgetList[i].widgetSetting)){
        			$scope.applyTransform($scope.iframilyWidgetList[i].widgetSetting);
        		}	
        	}
        }
    }

    $scope.mapIframilyData = function (widgetData, index) {
      var iframilyWidget = {
        widgetId: widgetData.widgetSettingId,
        widgetSetting: widgetData,
        pagenumber: [index],
        intervalObject: null,
      };
      
      if (widgetData.data.iframeDetail != null) {
        if ($scope.isProcessedMicrosoftOfficeDocument(widgetData)) {
          var refreshDelay = $scope.getIframeRefreshDelay(widgetData);
          if (
            refreshDelay != null &&
            $scope.isPreviewModeEnabled == false &&
            $scope.isChildDisplay == false
          ) {
            if (iframilyWidget.intervalObject != null) {
              $interval.cancel(iframilyWidget.intervalObject);
            }
            iframilyWidget.intervalObject = $interval(function () {
              $scope.refreshIframeData(
                widgetData.data.iframeDetail,
                widgetData.widgetSettingId
              );
            }, refreshDelay);
          }
        } else {
          var currentIframeInterval = $interval(function () {
            if (
              $scope.isMicrosoftOfficeS3Content(widgetData)
            ) {
              if (!iframilyWidget.pagenumber.includes($scope.quoteIndex)) {
                return;
              }
              $scope.loadIframilyDataIfNeeded(widgetData, $scope.quoteIndex);
              return;
            }
            $scope.loadIframilyData(widgetData);
          }, widgetData.data.iframeDetail.autoRefreshTime * 1000);

          iframilyWidget.intervalObject = currentIframeInterval;
        }
      }
      $scope.iframilyWidgetList.push(iframilyWidget);
    };
    
    $scope.getTrustedUrl = function(url) {
        return $sce.trustAsResourceUrl(url);
      };

    // Media worth caching locally: large, static, and otherwise re-fetched on
    // every reload. Extend this list as other widgets need local playback.
    $scope.CACHEABLE_MEDIA_EXTENSIONS = ["mp4", "webm", "m4v", "mov", "ogv"];

    $scope.isCacheableMediaUrl = function (url) {
      if (typeof url != "string" || url.trim().length == 0) {
        return false;
      }
      var cleanUrl = url.split(/[?#]/)[0].toLowerCase();
      var extensionMatch = cleanUrl.match(/\.([a-z0-9]+)$/);
      return (
        extensionMatch != null &&
        $scope.CACHEABLE_MEDIA_EXTENSIONS.indexOf(extensionMatch[1]) != -1
      );
    };

    /**
     * Resolve a remote media URL to a locally cached blob: URL and return it
     * trusted for binding. Generic — any widget holding a media URL can use it.
     *
     * Always resolves: on any failure the caller gets the remote URL trusted,
     * which is exactly the behaviour before caching existed.
     */
    $scope.getTrustedMediaUrl = function (url, options) {
      if (!$scope.isCacheableMediaUrl(url)) {
        return $q.when($scope.getTrustedUrl(url));
      }
      return mediaCache.getUrl(url, options).then(function (localUrl) {
        return $scope.getTrustedUrl(localUrl);
      });
    };

    /**
     * Bind a cached media URL onto a widget data property. Skips work when the
     * property is already set or a download for it is still running, so the
     * repeated widget initialisation calls do not fetch the same file twice.
     */
    $scope.bindTrustedMediaUrl = function (dataObject, property, url, options) {
      if (
        dataObject == null ||
        dataObject[property] ||
        dataObject[property + "Resolving"] == true
      ) {
        return;
      }

      dataObject[property + "Resolving"] = true;
      $scope.getTrustedMediaUrl(url, options).then(function (trustedUrl) {
        dataObject[property] = trustedUrl;
        dataObject[property + "Resolving"] = false;
      });
    };

    /**
     * Every cacheable media URL referenced by the current layout.
     * Add other widget types' URL properties here as they start using the cache.
     */
    $scope.collectWidgetMediaUrls = function () {
      var urls = [];

      for (var i = 0; i < $scope.groups.length; i++) {
        var widgets = $scope.groups[i].widgets || [];
        for (var j = 0; j < widgets.length; j++) {
          var widget = widgets[j];
          if (widget == null || widget.data == null) {
            continue;
          }
          // Keyed by the source document, so collect baseurl — but only when
          // there is a cacheable converted file behind it.
          if (
            $scope.isCacheableMediaUrl($scope.getWidgetProcessedMediaUrl(widget)) &&
            widget.data.baseurl
          ) {
            urls.push(widget.data.baseurl);
          }
        }
      }

      return urls;
    };

    /**
     * Drop cached media that no longer belongs to any widget on this display.
     *
     * Widgets can be deleted while a display is powered off, so their files are
     * never released through the refresh path — once the layout reloads without
     * them, nothing references those files at all. Reconciling against the newly
     * loaded layout is the only point where they can be identified.
     *
     * Skipped when the layout is empty: that is indistinguishable from a failed
     * or not-yet-finished load, and pruning against it would wipe the store.
     */
    $scope.pruneOrphanedMediaCache = function () {
      if (!mediaCache.isSupported() || $scope.groups == null || $scope.groups.length === 0) {
        return;
      }
      mediaCache.retainOnly($scope.collectWidgetMediaUrls());
    };

    /**
     * True when a widget other than the one being updated still points at this
     * media URL. The cache is keyed by URL rather than by widget, so two widgets
     * sharing a deck share one cache entry — evicting on one widget's behalf
     * would force the other to download the file again.
     */
    $scope.isMediaUrlReferencedElsewhere = function (url, exceptWidgetId, urlProperty) {
      if (!url) {
        return false;
      }

      for (var i = 0; i < $scope.groups.length; i++) {
        var widgets = $scope.groups[i].widgets || [];
        for (var j = 0; j < widgets.length; j++) {
          var candidate = widgets[j];
          if (
            candidate == null ||
            candidate.data == null ||
            candidate.widgetSettingId == exceptWidgetId
          ) {
            continue;
          }
          if (candidate.data[urlProperty] === url) {
            return true;
          }
        }
      }
      return false;
    };

    /**
     * Drop a widget's cached media when its source URL is being replaced. The
     * outgoing data object is the only place the previous URL still exists, so
     * this has to run before that object is discarded — afterwards the portal
     * has no reference to the superseded file at all.
     *
     * A no-op when the URL is unchanged, so unrelated widget edits (zoom,
     * transition, refresh interval) do not throw away a valid cached file.
     */
    $scope.discardReplacedMediaUrl = function (
      oldData,
      newData,
      keyProperty,
      mediaProperty,
      trustedProperty,
      widgetId
    ) {
      if (oldData == null) {
        return;
      }

      $scope.releaseTrustedMediaUrl(oldData, trustedProperty);

      var previousKey = oldData[keyProperty];
      var nextKey = newData != null ? newData[keyProperty] : null;

      if (
        $scope.isCacheableMediaUrl(oldData[mediaProperty]) &&
        previousKey &&
        previousKey !== nextKey &&
        !$scope.isMediaUrlReferencedElsewhere(previousKey, widgetId, keyProperty)
      ) {
        mediaCache.remove(previousKey);
      }
    };

    /**
     * Revoke a widget's blob: URL when its media source is replaced or removed.
     * Without this the underlying blob stays pinned for the life of the page —
     * which on a display that never navigates away means forever.
     */
    $scope.releaseTrustedMediaUrl = function (dataObject, property) {
      if (dataObject == null || !dataObject[property]) {
        return;
      }
      mediaCache.release($sce.valueOf(dataObject[property]));
      dataObject[property] = null;
      dataObject[property + "Resolving"] = false;
    };

    $scope.getWidgetIframeBaseUrl = function(widgetData) {
      if (!widgetData || !widgetData.data) {
        return "";
      }
      var iframeDetail = $scope.getIframeDetail(widgetData);
      var baseUrl = widgetData.data.baseurl;
      if (
        (typeof baseUrl != "string" || baseUrl.trim().length == 0) &&
        iframeDetail != null &&
        iframeDetail.baseurl != null
      ) {
        baseUrl = iframeDetail.baseurl;
      }
      return baseUrl || "";
    };

    /**
     * The converted media URL for a widget — the mp4 produced from an uploaded
     * document. Distinct from baseurl, which stays the source document and is
     * what the cache is keyed by.
     */
    $scope.getWidgetProcessedMediaUrl = function(widgetData) {
      if (!widgetData || !widgetData.data) {
        return "";
      }
      var processedUrl = widgetData.data.processedBaseurl;
      var iframeDetail = $scope.getIframeDetail(widgetData);
      if (
        (typeof processedUrl != "string" || processedUrl.trim().length == 0) &&
        iframeDetail != null &&
        iframeDetail.processedBaseurl != null
      ) {
        processedUrl = iframeDetail.processedBaseurl;
      }
      return processedUrl || "";
    };

    $scope.isProcessedMicrosoftOfficeDocument = function(widgetData) {
      if (
        widgetData == null ||
        widgetData.contentType != "microsoft_office_doc"
      ) {
        return false;
      }

      var processedUrl = $scope.getWidgetProcessedMediaUrl(widgetData);
      return typeof processedUrl == "string" && processedUrl.trim().length > 0;
    };

    $scope.getIframeRefreshDelay = function(widgetData) {
      var iframeDetail = $scope.getIframeDetail(widgetData);
      if (iframeDetail == null) {
        return null;
      }

      var refreshSeconds = Number(iframeDetail.autoRefreshTime);
      if (!isFinite(refreshSeconds) || refreshSeconds <= 0) {
        return null;
      }
      return refreshSeconds * 1000;
    };

    $scope.isMicrosoftOfficeEmbedUrl = function(url) {
      return (
        typeof url == "string" &&
        url.toLowerCase().indexOf("view.officeapps.live.com/op/embed.aspx") != -1
      );
    };

    $scope.isMicrosoftOfficeSupportedFileUrl = function(url) {
      if (typeof url != "string" || url.trim().length == 0) {
        return false;
      }
      if (!/^https?:\/\//i.test(url)) {
        return false;
      }

      var supportedExtensions = [
        "pptx",
        "ppt",
        "pps",
        "ppsx",
        "docx",
        "doc",
        "docm",
        "xlsx",
        "xls",
        "xlsb",
        "xlsm",
        "odt",
        "ods",
        "odp",
        "one",
      ];
      var cleanUrl = url.split(/[?#]/)[0].toLowerCase();
      var extensionMatch = cleanUrl.match(/\.([a-z0-9]+)$/);
      return (
        extensionMatch != null &&
        supportedExtensions.indexOf(extensionMatch[1]) != -1
      );
    };

    $scope.isPowerPointFileUrl = function(url) {
      if (typeof url != "string" || url.trim().length == 0) {
        return false;
      }

      var cleanUrl = url.split(/[?#]/)[0].toLowerCase();
      return /\.(ppt|pptx)$/.test(cleanUrl);
    };

    $scope.isMicrosoftPowerPointContent = function(widgetData) {
      if (widgetData == null || widgetData.contentType != "microsoft_office_doc") {
        return false;
      }

      var iframeDetail = $scope.getIframeDetail(widgetData);
      var sourceUrl = iframeDetail != null ? iframeDetail.baseurl : null;
      if (typeof sourceUrl != "string" || sourceUrl.trim().length == 0) {
        sourceUrl = $scope.getWidgetIframeBaseUrl(widgetData);
      }

      return $scope.isPowerPointFileUrl(sourceUrl);
    };

    $scope.hasMicrosoftPowerPointStatus = function(widgetData, status) {
      var iframeDetail = $scope.getIframeDetail(widgetData);
      return (
        $scope.isMicrosoftPowerPointContent(widgetData) &&
        iframeDetail != null &&
        typeof iframeDetail.status == "string" &&
        iframeDetail.status.toLowerCase() == status
      );
    };

    /**
     * True once a converted file is known to exist but is not ready to play —
     * still downloading into the cache, or not started yet. The widget keeps
     * showing the processing message through this, rather than an empty box.
     */
    $scope.isMicrosoftPowerPointMediaPending = function(widgetData) {
      return (
        $scope.hasMicrosoftPowerPointStatus(widgetData, "success") &&
        !widgetData.data.trustedVideoUrl
      );
    };

    /** True once the converted file is cached (or resolved) and can be played. */
    $scope.isMicrosoftPowerPointMediaReady = function(widgetData) {
      return (
        $scope.hasMicrosoftPowerPointStatus(widgetData, "success") &&
        !!widgetData.data.trustedVideoUrl
      );
    };

    $scope.isMicrosoftPowerPointVideoFlow = function(widgetData) {
      return (
        $scope.hasMicrosoftPowerPointStatus(widgetData, "processing") ||
        $scope.hasMicrosoftPowerPointStatus(widgetData, "success") ||
        $scope.hasMicrosoftPowerPointStatus(widgetData, "failed")
      );
    };

    $scope.getMicrosoftOfficeIframeUrl = function(widgetData) {
      var baseUrl = $scope.getWidgetIframeBaseUrl(widgetData);
      if (
        widgetData != null &&
        widgetData.contentType == "microsoft_office_doc" &&
        !$scope.isMicrosoftOfficeEmbedUrl(baseUrl) &&
        $scope.isMicrosoftOfficeSupportedFileUrl(baseUrl)
      ) {
        return (
          MANGO_MIRROR_CONSTANT.MICROSOFT_OFFICE_EMBED_BASE_URL +
          "?src=" +
          encodeURIComponent(baseUrl)
        );
      }
      return baseUrl;
    };

    $scope.getIframeDetail = function(widgetData) {
      if (
        !widgetData ||
        !widgetData.data ||
        widgetData.data.iframeDetail == undefined
      ) {
        return null;
      }
      return widgetData.data.iframeDetail;
    };
    
    $scope.isHtmlContent = function(widgetData) {
      const htmlTypes = ['pdf', 'google_doc', 'microsoft_office_doc', 'embed_website'];
      if (!widgetData || !widgetData.contentType) {
        return false;
      }
      var iframeDetail = $scope.getIframeDetail(widgetData);
      if (!htmlTypes.includes(widgetData.contentType)) {
        return true;
      }
	  return iframeDetail != null && iframeDetail.isS3Enabled === true;
	};

    $scope.isMicrosoftOfficeS3Content = function(widgetData) {
      var iframeDetail = $scope.getIframeDetail(widgetData);
      return (
        widgetData != null &&
        widgetData.contentType == "microsoft_office_doc" &&
        iframeDetail != null &&
        iframeDetail.isS3Enabled === true
      );
    };

    $scope.shouldLoadIframilyHtmlNow = function(widgetData, index) {
      return !$scope.isMicrosoftOfficeS3Content(widgetData) || index == $scope.quoteIndex;
    };

    $scope.loadIframilyDataIfNeeded = function(widgetData, index) {
      if ($scope.isMicrosoftOfficeS3Content(widgetData) && widgetData.data != null) {
        if (widgetData.data.isLoading === true) {
          if (index != null) {
            $scope.scheduleIframilyHtmlResize(widgetData, index);
          }
          return;
        }

        if (widgetData.data.iframilyHtmlLoaded === true) {
          if (index != null) {
            $scope.scheduleIframilyHtmlResize(widgetData, index);
          }
          return;
        }
      }

      $scope.loadIframilyData(widgetData);
    };

	$scope.isIframeContent = function(widgetData) {
	  const iframeTypes = ['google_doc', 'microsoft_office_doc', 'embed_website'];
      if (!widgetData || !widgetData.contentType) {
        return false;
      }
      var iframeDetail = $scope.getIframeDetail(widgetData);
	  return (
        iframeTypes.includes(widgetData.contentType) &&
        iframeDetail != null &&
        iframeDetail.isS3Enabled !== true
      );
	};
      
    $scope.applyTransform = function(widgetData) {
        if ($scope.isMicrosoftPowerPointVideoFlow(widgetData)) {
          return;
        }

    	var iframeDetail = $scope.getIframeDetail(widgetData);
        if (iframeDetail == undefined || iframeDetail == null) {
          return;
        }
        const zoom = parseFloat(iframeDetail.zoom/100) || 1;
        const offsetX = parseFloat(iframeDetail.hPos) || 0;
        const offsetY = parseFloat(iframeDetail.vPos) || 0;
        var iframeId = "iframily_" +widgetData.widgetSettingId +"_" +$scope.quoteIndex;
        
        var iframe = document.getElementById(iframeId);
        if(iframe!=null){
        	iframe.style.transform =
        		"translate(" + -offsetX + "px," + -offsetY + "px) scale(" + zoom + ")";
        	iframe.style.width = 100 / zoom + "%";
        	iframe.style.height = 100 / zoom + "%";
        	
        	if(offsetX<0){
        		iframe.style.width = iframe.offsetWidth + "px";
        	}else{
        		iframe.style.width = iframe.offsetWidth + offsetX + "px";	
        	}
        	
        	if(offsetY<0){
        		iframe.style.height = iframe.height + "px";
        	}else{
        		iframe.style.height = iframe.offsetHeight  + offsetY + "px";	
        	}
        	
        	widgetData.data.status = true;
        }
      }

    $scope.loadIframilyData = function (widgetData) {
      if ($scope.isMicrosoftPowerPointVideoFlow(widgetData)) {
        return;
      }

      if (
        Object.keys(widgetData.data).length === 0 &&
        widgetData.data.constructor === Object
      ) {
        return;
      }
      if (widgetData.data.type != undefined) {
        return "subscription required";
      }
      widgetData.data.status = false;
      widgetData.data.htmlContent = "Loading data....";
      var iframeDetail = $scope.getIframeDetail(widgetData);
      if (
        widgetData.data != undefined &&
        ((iframeDetail != null && iframeDetail.baseurl != undefined) ||
          widgetData.data.baseurl != undefined)
      ) {
        widgetData.data.isLoading = true;
        if (widgetData.contentType == "embed_html") {
          $scope.updateHtmlConetnt(
            iframeDetail != null ? iframeDetail.baseurl : widgetData.data.baseurl,
            widgetData
          );
          return;
        }else if (widgetData.contentType == "pdf") {
          var tempUrl = widgetData.data.baseurl;
          if (tempUrl != undefined) {
            $scope.updateHtmlConetnt(
              "<iframe loading=lazy allow='autoplay; encrypted-media' src='" +
                tempUrl +
                "' height=" +
                widgetData.height +
                "px" +
                " width=" +
                widgetData.width +
                "px allowfullscreen='true' frameborder='0'></iframe>",
              widgetData
            );
          } else {
            tempUrl = "";
            $scope.updateHtmlConetnt(
              "<iframe loading=lazy allow='autoplay; encrypted-media' src='" +
                tempUrl +
                "' height=" +
                widgetData.height +
                "px" +
                " width=" +
                widgetData.width +
                "px allowfullscreen='true' frameborder='0'></iframe>",
              widgetData
            );
          }
          return;
        } else if (widgetData.contentType == "google_doc" || widgetData.contentType=="embed_website" || widgetData.contentType=="microsoft_office_doc") {
          if(iframeDetail != undefined && (iframeDetail.isCustomUrlEnabled == null || iframeDetail.isCustomUrlEnabled == true)){
        	  $scope.applyTransform(widgetData);
        	  return;	
          }
        }

        var resourceUrl = "";
        if (
          iframeDetail != null &&
          (iframeDetail.isCustomUrlEnabled == null ||
          iframeDetail.isCustomUrlEnabled == true)
        ) {
          resourceUrl = iframeDetail.baseurl;
        } else if (iframeDetail != null && iframeDetail.isS3Enabled == true) {
          resourceUrl = widgetData.data.baseurl;
        }

        if (resourceUrl.trim().length == 0) {
          return;
        }

        var urlLink =
          MANGO_MIRROR_CONSTANT.IFRAMILY_BASE_URL +
          "&url=" +
          resourceUrl +
          "&maxheight=" +
          widgetData.height;

        if (widgetData.contentType == "video") {
          if (
            urlLink.includes("vimeo") &&
            iframeDetail != null &&
            (iframeDetail.isCustomUrlEnabled == null ||
              iframeDetail.isCustomUrlEnabled == true)
          ) {
            urlLink = urlLink + "&autoplay=1&mute=1";
          } else {
            var html = $scope.getVideoIframe(widgetData);
            $scope.updateHtmlConetnt(html, widgetData);
            return;
          }
        }
        try {
          $http({
            method: "GET",
            header: {
              "Content-Type": "application/json",
            },
            url: urlLink,
          }).then(
            function (res) {
              if (res.data != undefined) {
                if (res.data.status == undefined) {
                  if (res.data.html != undefined) {
                    var htmlResponse = res.data.html;
                    $scope.updateHtmlConetnt(htmlResponse, widgetData);
                  }
                } else {
                  if (res.data.status == 403) {
                    $scope.updateHtmlConetnt(
                      "<iframe loading=lazy src='" +
                        resourceUrl +
                        "' height=" +
                        widgetData.height +
                        "px" +
                        " width=" +
                        widgetData.width +
                        "px></iframe>",
                      widgetData
                    );
                    return;
                  } else {
                    var message =
                      "Unable to load " +
                      widgetData.displayName +
                      ". Please check that the URL is valid and publicly accessible, and try again.";
                    $scope.updateHtmlConetnt(message, widgetData);
                  }
                }
              }
            },
            function (error) {
              var message =
                "Unable to load " +
                widgetData.displayName +
                ". Please check that the URL is valid and publicly accessible, and try again.";
              $scope.updateHtmlConetnt(message, widgetData);
            }
          );
        } catch (e) {
          console.log("Something went wrong while fetching iframely data" + e);
        }
      } else {
        widgetData.data.htmlContent = "";
      }
    };

    //get html data for video
    $scope.getVideoIframe = function (widgetData) {
      var html = "";
      var baseUrl = widgetData.data.baseurl;
      var iframeDetail = $scope.getIframeDetail(widgetData);
      if (baseUrl == undefined) {
        if (
          iframeDetail != null &&
          (iframeDetail.isCustomUrlEnabled == null ||
            iframeDetail.isCustomUrlEnabled == true) &&
          iframeDetail.baseurl != null
        ) {
          baseUrl = iframeDetail.baseurl;
        }
      }

      if (baseUrl == undefined) {
        return html;
      }

      if (baseUrl.includes("youtu")) {
        var url = "https://www.youtube.com/";
        baseUrl = baseUrl.replace(
          "https://youtu.be",
          "https://www.youtube.com"
        );
        var videoId = "";
        if (baseUrl.includes("watch?v=")) {
          videoId = baseUrl.substr(baseUrl.lastIndexOf("=") + 1);
        } else {
          videoId = baseUrl.substr(baseUrl.lastIndexOf("/") + 1);
        }
        var additionalParameter =
          "?autoplay=1&mute=1&loop=1&playlist=" + videoId;
        url = url + "embed/" + videoId + additionalParameter;
        html =
          "<iframe height=" +
          widgetData.height +
          " width=" +
          widgetData.width +
          " src=" +
          url +
          " frameborder='0' allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture' allowfullscreen></iframe>";
      } else {
        html =
          "<video height=" +
          widgetData.height +
          "px" +
          " width=" +
          widgetData.width +
          "px autoplay='1' loop='1' muted='1'> <source src=" +
          baseUrl +
          " type='video/mp4'></video>";
      }
      return html;
    };

    //remove old mapped data
    $scope.removeOldMappedIframeData = function (widgetSettingId) {
      for (var i = 0; i < $scope.iframilyWidgetList.length; i++) {
        if ($scope.iframilyWidgetList[i].widgetId == widgetSettingId) {
          if ($scope.iframilyWidgetList[i].intervalObject != null) {
            $interval.cancel($scope.iframilyWidgetList[i].intervalObject);
          }
          $scope.iframilyWidgetList.splice(i, 1);
          i--;
        }
      }
    };

    //iframely check if data  is already mapped
    $scope.checkIfIframilySettingAdded = function (widgetData) {
      for (var i = 0; i < $scope.iframilyWidgetList.length; i++) {
        if (
          $scope.iframilyWidgetList[i].widgetId == widgetData.widgetSettingId
        ) {
          return true;
        }
      }
      return false;
    };
    
    $scope.clearPowerBiExistObject = function (widgetSettingId) {
      for (var i = 0; i < $scope.powerBiWidgetList.length; i++) {
        if ($scope.powerBiWidgetList[i].widgetId == widgetSettingId) {
          var object = $scope.powerBiWidgetList[i];

          if(object.intervalObject!=undefined){
            $interval.cancel(object.intervalObject);
          }

          if(object.pollingIntervalObject!=undefined){
            $interval.cancel(object.pollingIntervalObject);
          }

          if(object.visualRefreshIntervalObject!=undefined){
            $interval.cancel(object.visualRefreshIntervalObject);
          }

          $scope.powerBiWidgetList.splice(i, 1);
        }
      }
    };

    $scope.updatePowerBiData = function(powerbiDataResponse){
      angular.forEach(powerbiDataResponse, function (powerBiData, widgetId) {
        var isPowerBiObjectCleared = false;
        for (var i = 0; i < $scope.groups.length; i++) {
          for (var j = 0; j < $scope.groups[i].widgets.length; j++) {
            var widgerData = $scope.groups[i].widgets[j];
            if (widgerData.type != "subscriptionError") {
              if (
                $scope.groups[i].widgets[j].widgetSettingId == parseInt(widgetId)
              ) {
                if(isPowerBiObjectCleared == false){
                  $scope.clearPowerBiExistObject(parseInt(widgetId));
                  isPowerBiObjectCleared = true;
                }
                $scope.groups[i].widgets[j].data.selectedReport = powerBiData;
                $scope.$apply();
                $scope.initializePowerBiWidget($scope.groups[i].widgets[j],i);
                continue;
              }
            }
          }
        }
      });
    }

    $scope.getWidgetCollectionByType = function(widgetType){
      switch (widgetType) {
        case MANGO_MIRROR_CONSTANT.WIDGET_TYPE_IMAGE:
          return $scope.imageWidgetList;
        case MANGO_MIRROR_CONSTANT.WIDGET_TYPE_IFRAMILY:
          return $scope.iframilyWidgetList;
        case MANGO_MIRROR_CONSTANT.WIDGET_TYPE_WEATHER:
          return $scope.weatherWidgetList;
        case MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CLOCK:
          return $scope.clockWidgetList;
        case MANGO_MIRROR_CONSTANT.WIDGET_TYPE_QUOTES:
          return $scope.quoteWidgetList;
        case MANGO_MIRROR_CONSTANT.WIDGET_TYPE_NEWS:
          return $scope.newsWidgetList;
        case MANGO_MIRROR_CONSTANT.WIDGET_TYPE_POWER_BI:
          return $scope.powerBiWidgetList;
        default:
          return [];
      }
    };

    $scope.isWidgetOnCurrentPage = function(widgetType, widgetSettingId){
      var widgetCollection = $scope.getWidgetCollectionByType(widgetType);

      for (var i = 0; i < widgetCollection.length; i++) {
        if (
          widgetCollection[i].widgetId == parseInt(widgetSettingId) &&
          widgetCollection[i].pagenumber != undefined &&
          widgetCollection[i].pagenumber.includes($scope.quoteIndex)
        ) {
          return true;
        }
      }
      return false;
    };

    $scope.getPowerBiWidgetById = function(widgetSettingId){
      for (var i = 0; i < $scope.powerBiWidgetList.length; i++) {
        if ($scope.powerBiWidgetList[i].widgetId == parseInt(widgetSettingId)) {
          return $scope.powerBiWidgetList[i];
        }
      }
      return null;
    };

    $scope.getCurrentPowerBiWidgetIndexObject = function(widgetSettingId){
      var powerBiWidget = $scope.getPowerBiWidgetById(widgetSettingId);

      if(powerBiWidget == null){
        return null;
      }

      for (var i = 0; i < powerBiWidget.widgetIndexKey.length; i++) {
        if(powerBiWidget.widgetIndexKey[i].pagenumber == $scope.quoteIndex){
          return powerBiWidget.widgetIndexKey[i];
        }
      }

      return null;
    };

    $scope.markPowerBiWidgetRendered = function(widgetSettingId){
      var widgetIndexObject = $scope.getCurrentPowerBiWidgetIndexObject(widgetSettingId);

      if(widgetIndexObject != null){
        widgetIndexObject.isDataUpdateNeeded = false;
      }
    };

    $scope.updatePowerBiDataUpdateNeeded = function(widgetSettingId, isDataUpdateNeeded){
      var powerBiWidget = $scope.getPowerBiWidgetById(widgetSettingId);

      if(powerBiWidget != null){
        for (var i = 0; i < powerBiWidget.widgetIndexKey.length; i++) {
          powerBiWidget.widgetIndexKey[i].isDataUpdateNeeded = isDataUpdateNeeded;
        }
      }
    };

    $scope.isPowerBiRenderNeeded = function(widgetSettingId){
      var widgetIndexObject = $scope.getCurrentPowerBiWidgetIndexObject(widgetSettingId);

      if(widgetIndexObject == null){
        return false;
      }

      if(widgetIndexObject.isDataUpdateNeeded == undefined){
        widgetIndexObject.isDataUpdateNeeded = true;
      }

      return widgetIndexObject.isDataUpdateNeeded == true;
    };

    $scope.stopPowerBiPolling = function(widgetSettingId){
      var powerBiWidget = $scope.getPowerBiWidgetById(widgetSettingId);

      if(powerBiWidget != null && powerBiWidget.pollingIntervalObject!=undefined){
        $interval.cancel(powerBiWidget.pollingIntervalObject);
        powerBiWidget.pollingIntervalObject = null;
      }
    };

    $scope.stopPowerBiTokenRefresh = function(widgetSettingId){
      var powerBiWidget = $scope.getPowerBiWidgetById(widgetSettingId);

      if(powerBiWidget != null && powerBiWidget.intervalObject!=undefined){
        $interval.cancel(powerBiWidget.intervalObject);
        powerBiWidget.intervalObject = null;
      }
    };

    $scope.updatePowerBiEmbeddedAccessToken = function(widgetSettingId, accessToken){
      var powerBiWidget = $scope.getPowerBiWidgetById(widgetSettingId);
      var accessTokenPromises = [];

      if(powerBiWidget == null || accessToken == null){
        return $q.when();
      }

      angular.forEach(powerBiWidget.widgetIndexKey, function(widgetIndexObject){
        if(
          widgetIndexObject.powerBiObject != null &&
          typeof widgetIndexObject.powerBiObject.setAccessToken === "function"
        ){
          var accessTokenPromise = widgetIndexObject.powerBiObject.setAccessToken(accessToken);
          if(accessTokenPromise != null && typeof accessTokenPromise.then === "function"){
            accessTokenPromises.push(accessTokenPromise);
          }
        }
      });

      return $q.all(accessTokenPromises);
    };

    $scope.reloadPowerBiWidget = function(widgetSettingId, forceReload){
      if(!$scope.isWidgetOnCurrentPage(MANGO_MIRROR_CONSTANT.WIDGET_TYPE_POWER_BI, widgetSettingId)){
        return;
      }

      var widgetIndexObject = $scope.getCurrentPowerBiWidgetIndexObject(widgetSettingId);

      try {
        if(widgetIndexObject != null && widgetIndexObject.powerBiObject != null){
          var refreshPromise = null;

          if(forceReload == true && typeof widgetIndexObject.powerBiObject.reload === "function"){
            refreshPromise = widgetIndexObject.powerBiObject.reload();
          } else if(typeof widgetIndexObject.powerBiObject.refresh === "function"){
            refreshPromise = widgetIndexObject.powerBiObject.refresh();
          } else if(typeof widgetIndexObject.powerBiObject.reload === "function"){
            refreshPromise = widgetIndexObject.powerBiObject.reload();
          }

          if(refreshPromise != null && typeof refreshPromise.then === "function"){
            refreshPromise.then(function(){
              $scope.markPowerBiWidgetRendered(widgetSettingId);
            }, function(){
              $scope.updatePowerBiDataUpdateNeeded(widgetSettingId, true);
              var powerBiWidget = $scope.getPowerBiWidgetById(widgetSettingId);
              if(powerBiWidget != null && powerBiWidget.widgetSetting.data.selectedReport != null){
                $scope.renderPowerBiWidgetIfNeeded(powerBiWidget.widgetSetting.data.selectedReport, widgetSettingId);
              }
            });
          }

          if(refreshPromise != null){
            return;
          }
        }
      } catch (e) {
        console.log("There are some issues while refreshing the powerbi report");
      }

      $scope.updatePowerBiDataUpdateNeeded(widgetSettingId, true);
      var powerBiWidget = $scope.getPowerBiWidgetById(widgetSettingId);
      if(powerBiWidget != null && powerBiWidget.widgetSetting.data.selectedReport != null){
        $scope.renderPowerBiWidgetIfNeeded(powerBiWidget.widgetSetting.data.selectedReport, widgetSettingId);
      }
    };

    $scope.renderPowerBiWidgetIfNeeded = function(powerBiData, widgetSettingId){
      if(
        powerBiData == null ||
        powerBiData.accessToken == null ||
        !$scope.isWidgetOnCurrentPage(MANGO_MIRROR_CONSTANT.WIDGET_TYPE_POWER_BI, widgetSettingId) ||
        !$scope.isPowerBiRenderNeeded(widgetSettingId)
      ){
        return;
      }

      $scope.renderPowerBiData(powerBiData, widgetSettingId);
    };

    $scope.pollDataAndCheckStatus = function(powerBiData, widgetSettingId){
      APIServices.pollPowerBiData(powerBiData)
        .success(function (res) {
        	if(res.status=="SUCCESS"){
        		var result = res.object;
        		$scope.updateTokendetails(result, widgetSettingId);

            if(result.refreshHistoryAvailable==false || result.refreshAccessDenied==true){
              $scope.stopPowerBiPolling(widgetSettingId);
              $scope.stopPowerBiTokenRefresh(widgetSettingId);
              return;
            }

            if(result.isDataUpdateNeeded==true){
              var accessTokenUpdatePromise = $scope.updatePowerBiEmbeddedAccessToken(widgetSettingId, result.accessToken);
              accessTokenUpdatePromise.finally(function(){
                $scope.updatePowerBiDataUpdateNeeded(widgetSettingId, true);
                $scope.reloadPowerBiWidget(widgetSettingId, true);
              });
            }
         	}
        })
        .error(function (data, status) {
          console.log(
            "There are some issues while generating the powerbi token"
          );
        });	
    }
    
    
    const models = window['powerbi-client'].models;
    var POWERBI_TOKEN_ERROR_MESSAGE = "This report hasn\u2019t been shared with you.";

    $scope.getPowerBiElementId = function (widgetSettingId, pageIndex) {
      return "pbi_" + widgetSettingId + "_" + pageIndex;
    };

    $scope.clearPowerBiWidgetMessage = function (reportContainer) {
      if (reportContainer != null) {
        reportContainer.classList.remove("powerbi-widget-message");
        reportContainer.innerText = "";
      }
    };

    $scope.showPowerBiWidgetMessage = function (widgetSettingId, pageIndex, message) {
      var reportContainer = document.getElementById(
        $scope.getPowerBiElementId(widgetSettingId, pageIndex)
      );
      if (reportContainer != null) {
        try {
          powerbi.reset(reportContainer);
        } catch (e) {
          // ignore if nothing was embedded yet
        }
        reportContainer.innerText = message;
        reportContainer.classList.add("powerbi-widget-message");
        return true;
      }

      return false;
    };

    $scope.showPowerBiTokenErrorMessage = function (widgetSettingId) {
      var isMessageShown = false;

      for (var i = 0; i < $scope.powerBiWidgetList.length; i++) {
        if ($scope.powerBiWidgetList[i].widgetId == widgetSettingId) {
          angular.forEach($scope.powerBiWidgetList[i].pagenumber, function (pageIndex) {
            if ($scope.showPowerBiWidgetMessage(
              widgetSettingId,
              pageIndex,
              POWERBI_TOKEN_ERROR_MESSAGE
            )) {
              isMessageShown = true;
            }
          });
        }
      }

      if (isMessageShown == false) {
        $scope.showPowerBiWidgetMessage(
          widgetSettingId,
          $scope.quoteIndex,
          POWERBI_TOKEN_ERROR_MESSAGE
        );
      }
    };

    $scope.renderPowerBiData = function(powerBiData, widgetSettingId){
    	$timeout(function() {
    		// Get the container element
            const reportContainer = document.getElementById(
              $scope.getPowerBiElementId(widgetSettingId, $scope.quoteIndex)
            );
        	
    		// Clear any existing embed safely
    		try {
    		    powerbi.reset(reportContainer);
    		} catch (e) {
    		    // ignore if nothing was embedded yet
    		}
            $scope.clearPowerBiWidgetMessage(reportContainer);

            // Configuration for embedding
            var embedConfiguration = {
              type: 'report',
              id: powerBiData.reportId,
              embedUrl: powerBiData.embedUrl,
              accessToken: powerBiData.accessToken,
              tokenType: models.TokenType.Aad,
              settings: {
            	  layoutType: models.LayoutType.Custom,
                  customLayout: {
                      displayOption: models.DisplayOption.FitToPage   // ← key for no scroll bars
                  },            	  
            	  panes: {
            		  filters: { visible: false },
            		  pageNavigation: { visible: true }
                }
              }
            };
            if(powerBiData.type=="Dashboard"){
            	embedConfiguration.type = "dashboard";
            }
            
            // Embed the report
            var powerBiObject = powerbi.embed(reportContainer, embedConfiguration);
            var widgetIndexObject = $scope.getCurrentPowerBiWidgetIndexObject(widgetSettingId);
            if(widgetIndexObject != null){
              widgetIndexObject.powerBiObject = powerBiObject;
            }
            $scope.markPowerBiWidgetRendered(widgetSettingId);
		},200);
    }

    $scope.generatePowerBiAccessToken = function (powerBiData,widgetSettingId) {
      APIServices.getPowerbiAccessToken(powerBiData)
        .success(function (res) {
          if(res.status=="SUCCESS"){
            $scope.updateTokendetails(res.object, widgetSettingId);
            $scope.updatePowerBiEmbeddedAccessToken(widgetSettingId, res.object.accessToken);
            $scope.renderPowerBiWidgetIfNeeded(res.object, widgetSettingId);
          } else {
            $scope.showPowerBiTokenErrorMessage(widgetSettingId);
          }
        })
        .error(function (data, status) {
          console.log(
            "There are some issues while generating the powerbi token"
          );
          $scope.showPowerBiTokenErrorMessage(widgetSettingId);
        });
      }

    $scope.updateTokendetails = function(powerBiData,widgetSettingId){
    	for (var i = 0; i < $scope.powerBiWidgetList.length; i++) {
			  if ($scope.powerBiWidgetList[i].widgetId == widgetSettingId) {
				  var widgetSetting = $scope.powerBiWidgetList[i].widgetSetting;
				  widgetSetting.data.selectedReport = powerBiData;
	          }
	     }
    }
    
    $scope.mapPowerBiData = function (widgetData, index, widgetIndex) {
        var powerBiWidget = {
          widgetId: widgetData.widgetSettingId,
          widgetSetting: widgetData,
          pagenumber: [index],
          intervalObject: null,
          pollingIntervalObject: null,
          visualRefreshIntervalObject: null,
          refreshHistoryAvailable: true,
          widgetIndexKey: [{ pagenumber: index, widgetIndexNumber: widgetIndex, isDataUpdateNeeded: true, powerBiObject: null }],
        };

        var isDataFound = false;
        angular.forEach($scope.powerBiWidgetList, function (data) {
          if (data.widgetId == widgetData.widgetSettingId) {
            isDataFound = true;
            var isWidgetIndexFound = false;

            angular.forEach(data.widgetIndexKey, function (widgetIndexData) {
              if (
                widgetIndexData.pagenumber == index &&
                widgetIndexData.widgetIndexNumber == widgetIndex
              ) {
                isWidgetIndexFound = true;
              }
            });

            if(isWidgetIndexFound == false){
              var widgetIndexObject = {
                pagenumber: index,
                widgetIndexNumber: widgetIndex,
                isDataUpdateNeeded: true,
                powerBiObject: null,
              };

              if(!data.pagenumber.includes(index)){
                data.pagenumber.push(index);
              }

              data.widgetIndexKey.push(widgetIndexObject);
            }
          }
        });
        if (isDataFound == false) {
          $scope.powerBiWidgetList.push(powerBiWidget);

          if (widgetData.data != null) {
        	
        	  // one initial call we are making instantly
        	  if(widgetData.data.selectedReport!=null && (widgetData.data.selectedReport.reportId!=null || widgetData.data.selectedReport.dashboardId!=null)){
                  $scope.generatePowerBiAccessToken(widgetData.data.selectedReport,widgetData.widgetSettingId);
        		  // we are refreshing the token after every 50 minutes
                  if (powerBiWidget.intervalObject != null) {
                    $interval.cancel(powerBiWidget.intervalObject);
                  }
                  
                  var interval = $interval(function() {
                    $scope.generatePowerBiAccessToken(widgetData.data.selectedReport,widgetData.widgetSettingId);
                  },3000000);
                  
                  powerBiWidget.intervalObject = interval;
                  
                  //set data polling interval
                  $scope.pollDataAndCheckStatus(widgetData.data.selectedReport,widgetData.widgetSettingId);
                  var pollingIntervalObject = $interval(function() {
            			$scope.pollDataAndCheckStatus(widgetData.data.selectedReport,widgetData.widgetSettingId);
                    },60000);
                  
                  powerBiWidget.pollingIntervalObject = pollingIntervalObject;
        	  }
          }
        }
      };
    
      $scope.checkIfWidgetSettingAdded = function (widgetData, type) {
    	  if(type=="powerbi"){
    		  for (var i = 0; i < $scope.powerBiWidgetList.length; i++) {
    			  if ($scope.powerBiWidgetList[i].widgetId == widgetData.widgetSettingId) {
    				  return true;
    	          }
    	       }
    	  }
          return false;
        };
        
    $scope.checkAndRenderPowerBi = function(value){
      if(!$scope.isWidgetOnCurrentPage(MANGO_MIRROR_CONSTANT.WIDGET_TYPE_POWER_BI, value.widgetSettingId)){
        return;
      }

      $scope.resizePowerBi();

      var powerBiWidget = $scope.getPowerBiWidgetById(value.widgetSettingId);
      var powerBiData = value.data.selectedReport;

      if(
        powerBiWidget != null &&
        powerBiWidget.widgetSetting.data.selectedReport != null
      ){
        powerBiData = powerBiWidget.widgetSetting.data.selectedReport;
      }

      $scope.renderPowerBiWidgetIfNeeded(powerBiData,value.widgetSettingId);
    }
    
    $scope.resizePowerBi = function(){
        try {
            for (var i = 0; i < $scope.powerBiWidgetList.length; i++) {
              if (
                $scope.powerBiWidgetList[i].pagenumber.includes($scope.quoteIndex)
              ) {
                var widgetData = $scope.powerBiWidgetList[i].widgetSetting;
                var titleFormatObject = JSON.parse(
                  widgetData.widgetBackgroundSettingModel.widgetTitleFormat
                );
                var bodyElementId = "pbi_" +widgetData.widgetSettingId +"_" +$scope.quoteIndex;
                var widgetBody = window.document.getElementById(bodyElementId);

                if (widgetBody != null) {
                  if (
                    widgetData.widgetBackgroundSettingModel.isNameVisible == true
                  ) {
                    var bodyheight =
                      widgetData.height - titleFormatObject.fontSize * 1.5;
                    widgetBody.style.height = bodyheight + "px";
                  } else {
                    widgetBody.style.height = widgetData.height + "px";
                  }
                } else {
                  $timeout(function () {
                	  $scope.resizePowerBi();
                  }, 200);
                  return;
                }
              }
            }
          } catch (e) {
            console.log("Something went wrong while resizing quotes widget");
          }
    }
    
    $scope.initializePowerBiWidget =  function (widgetData,outerindex,innerIndex) {
    	if(widgetData.data.selectedReport!=undefined){
    		if ($scope.checkIfWidgetSettingAdded(widgetData,"powerbi") == false) {
          $timeout(function () {
                  $scope.showPowerBiWidgetMessage(
                    widgetData.widgetSettingId,
                    outerindex,
                    "Loading Power BI content. Please wait..."
                  );
                }, 100);
              }
        $scope.mapPowerBiData(widgetData, outerindex, innerIndex);
    	}
    }
    
    
    $scope.initializeBrowserSnapshotWidget =  function (widgetData, index) {
    	if(widgetData.data.browserSnapshotData!=undefined && widgetData.data.browserSnapshotData.autoRefreshTime>0){
    		$timeout(function() {
    			$scope.updateBrowserSnapshotTimeout(widgetData);
			},widgetData.data.browserSnapshotData.autoRefreshTime);
    	}
    	
    	$timeout(function() {
    		var browserSnapshotElement = document.getElementById(
                    "bs_" + widgetData.widgetSettingId + "_" + $scope.quoteIndex
                  );
            
            if(browserSnapshotElement!=undefined){
            	var browserSnapshotData = widgetData.data.browserSnapshotData;
            	var key = browserSnapshotData.s3ImageUrl;
            	key = key.replace(
                        "https://myfiles.mangodisplay.com/",
                        ""
                      );
            	var contentType = browserSnapshotData.isCropToFill
                  ? "cover"
                  : "contain";
                var browserSnapshotUrl = $scope.buildUrl(
                    key,
                    widgetData.height,
                    widgetData.width,
                    contentType
                  );
                
            	$scope.setBackgroundImage(
            			browserSnapshotElement,
            			browserSnapshotUrl,
            			browserSnapshotData.isCropToFill ? "cover" : "contain",
            			browserSnapshotData.imageBrightness
                      );
            }
    	},100);
    }
    
    $scope.updateBrowserSnapshotTimeout = function (snapshotDetail) {
        var isSnapshotDetailFound = false;
        for (var i = 0; i < $scope.snapshotList .length; i++) {
          if (
            $scope.snapshotList[i].widgetId == snapshotDetail.widgetSettingId
          ) {
        	  isSnapshotDetailFound = true;
        	  break;
          }
        }

        if (isSnapshotDetailFound == false) {
          var snapshotInterval = $interval(function () {
            $scope.refreshSnapshotData(snapshotDetail);
          }, snapshotDetail.data.browserSnapshotData.autoRefreshTime*1000);
          
          var snapshotIntervalData = {
            snapshotIntervalObject: snapshotInterval,
            widgetId: snapshotDetail.widgetSettingId,
          };
          $scope.snapshotList.push(snapshotIntervalData);
        }
      };
      
      // call refresh browser snap shot method
      $scope.refreshSnapshotData = function (snapshotDetail) {
          try {
        	  
        	  if($scope.isChildDisplay == true){
        		  return
        	  }
        	  
        	  if(snapshotDetail.data==undefined || snapshotDetail.data.browserSnapshotData==undefined || snapshotDetail.data.browserSnapshotData.sessionId==null){
        		  return;
        	  }
            
            APIServices.refreshSnapshotData(snapshotDetail.data.browserSnapshotData)
              .success(function (data, status) {
                console.log("browser snapshot call was successfull");
              })
              .error(function (data, status) {
                console.log("browser snapshot call was unsuccessfull");
              });
          } catch (e) {
            console.log("Something went wrong");
          }
        };

   	//initialize iframe widget
    $scope.initializeIframilyWidget = function (widgetData, index) {
      if (widgetData.contentType == "pdf") {
        if (
          $scope.checkIfImageSettingAdded(widgetData) == false &&
          Object.keys(widgetData.data).length > 0
        ) {
          $timeout(function () {
            $scope.refreshIframeData(
              widgetData.data.iframeDetail,
              widgetData.widgetSettingId
            );
          }, 2000);
          $scope.mapImageData(widgetData, index);
          if (widgetData.data.pdfImages != null) {
            $scope.loadS3Url(widgetData);
          }
        }
      } else {
        // Needs a source document to cache against; without one there is
        // nothing to key the converted file by, so leave it alone.
        if (
          $scope.hasMicrosoftPowerPointStatus(widgetData, "success") &&
          widgetData.data.baseurl
        ) {
          // Play the converted mp4, but cache it under the source document URL:
          // baseurl is the stable identity for this content, while the
          // processed URL can differ between responses.
          $scope.bindTrustedMediaUrl(
            widgetData.data,
            "trustedVideoUrl",
            $scope.getWidgetProcessedMediaUrl(widgetData),
            { keyUrl: widgetData.data.baseurl }
          );
        }

        if ($scope.checkIfIframilySettingAdded(widgetData) == false) {
        $scope.mapIframilyData(widgetData, index);
          
          // Initialize trusted URL only once
          if (!widgetData.data.trustedIframeUrl && $scope.isIframeContent(widgetData)) {
            widgetData.data.trustedIframeUrl = $scope.getTrustedUrl(
              $scope.getMicrosoftOfficeIframeUrl(widgetData)
            );
            
            // Set default transform values if not present
            if (!widgetData.data.iframeDetail.zoom) {
              widgetData.data.iframeDetail.zoom = 100;
            }
            if (!widgetData.data.iframeDetail.hPos) {
              widgetData.data.iframeDetail.hPos = 0;
            }
            if (!widgetData.data.iframeDetail.vPos) {
              widgetData.data.iframeDetail.vPos = 0;
            }
            
            if($scope.quoteIndex==index){
          	  $timeout(function () {
                    $scope.loadIframilyData(widgetData);
                  }, 500);  
            }
          }else{
            if (!$scope.shouldLoadIframilyHtmlNow(widgetData, index)) {
              return;
            }
         	  $timeout(function () {
                  $scope.loadIframilyDataIfNeeded(widgetData, index);
                }, 500);
          }
        } else {
          for (var i = 0; i < $scope.iframilyWidgetList.length; i++) {
            if (
              $scope.iframilyWidgetList[i].widgetId ==
                widgetData.widgetSettingId &&
              !$scope.iframilyWidgetList[i].pagenumber.includes(index)
            ) {
              $scope.iframilyWidgetList[i].pagenumber.push(index);
            }
          }
        }
      }
    };

    $scope.refreshIframeData = function (iframeDetail, widgetSettingId) {
      if (iframeDetail.widgetSetting === null) {
        iframeDetail.widgetSetting = {}; // Initialize widgetSetting as an object
      }
      iframeDetail.widgetSetting.id = widgetSettingId;
      APIServices.refreshIframeData(iframeDetail)
        .success(function (data, status) {})
        .error(function (data, status) {
          console.log("There are some issues while fetching apple photo");
        });
    };

    $scope.nextPage = function () {
      if ($scope.getRenderablePageCount() > 1) {
        $timeout.cancel($scope.reverseTimeout);
        $scope.clearReverseAnimation();

        $timeout(function () {
          angular
            .element("#" + $scope.groups[$scope.quoteIndex].pageId)
            .css({
              left: "0%",
              position: "absolute",
              visibility: "visible",
              opacity: "1",
            }) // jump back
            .animate(
              {
                left: "-100%",
                position: "absolute",
                visibility: "visible",
                opacity: "1",
              },
              "1s",
              "linear"
            );
          angular
            .element("#" + $scope.groups[$scope.quoteIndex].pageId)
            .css("z-index", 998);

          $scope.quoteIndex = $scope.getRenderablePageIndex(
            $scope.quoteIndex + 1,
            1
          );

          $timeout(function () {
            $scope.checkAndUpdatePageBg();
            $scope.showCurrentPageImageWidget();
            if ($scope.quoteIndex > 0) {
              $scope.resizeIframeWidget($scope.quoteIndex);
            }
          }, 100);

          $scope.delayTime = $scope.groups[$scope.quoteIndex].delay;
          $scope.pinnedWidgetId =
            $scope.groups[$scope.quoteIndex].pinnedWidegtId;
          $timeout($scope.autoResizeByPageNumber($scope.quoteIndex));

          angular
            .element("#" + $scope.groups[$scope.quoteIndex].pageId)
            .css({
              left: "100%",
              position: "absolute",
              visibility: "visible",
              opacity: "1",
            }) // jump back
            .animate(
              {
                left: "0%",
                position: "absolute",
                visibility: "visible",
                opacity: "1",
              },
              "1s",
              "linear"
            );
          angular
            .element("#" + $scope.groups[$scope.quoteIndex].pageId)
            .css("z-index", 999);
        });
      }
    };

    $scope.previousPage = function () {
      if ($scope.getRenderablePageCount() > 1) {
        $timeout.cancel($scope.reverseTimeout);
        $scope.clearReverseAnimation();

        $timeout(function () {
          angular
            .element("#" + $scope.groups[$scope.quoteIndex].pageId)
            .css({
              left: "0%",
              position: "absolute",
              visibility: "visible",
              opacity: "1",
            })
            .animate(
              {
                left: "100%",
                position: "absolute",
                visibility: "visible",
                opacity: "1",
              },
              "1s",
              "linear"
            );

          $scope.pageCounter = 0;
          if ($scope.getRenderablePageCount() > 1) {
            $scope.quoteIndex = $scope.getRenderablePageIndex(
              $scope.quoteIndex - 1,
              -1
            );
          }

          $timeout(function () {
            $scope.checkAndUpdatePageBg();
            $scope.showCurrentPageImageWidget();
            if ($scope.quoteIndex > 0) {
              $scope.resizeIframeWidget($scope.quoteIndex);
            }
          }, 100);

          $scope.delayTime = $scope.groups[$scope.quoteIndex].delay;
          $scope.pinnedWidgetId =
            $scope.groups[$scope.quoteIndex].pinnedWidegtId;
          $timeout($scope.autoResizeByPageNumber($scope.quoteIndex));

          angular
            .element("#" + $scope.groups[$scope.quoteIndex].pageId)
            .css({ left: "-100%", position: "absolute", visibility: "visible" })
            .animate(
              {
                left: "0%",
                position: "absolute",
                visibility: "visible",
                opacity: "1",
              },
              "1s",
              "linear"
            );
        });
      }
    };

    $scope.goToPage = function (pageIndex, event) {
      if (
        $scope.shouldDisableGestureAndClickEvents() &&
        !isPageNavigationButtonTarget(event)
      ) {
        return;
      }
      if (
        pageIndex === undefined ||
        pageIndex === null ||
        $scope.groups.length === 0 ||
        pageIndex < 0 ||
        pageIndex >= $scope.groups.length ||
        pageIndex === $scope.quoteIndex
      ) {
        return;
      }

      var targetPageIndex = $scope.getRenderablePageIndex(pageIndex, 1);
      if (targetPageIndex === $scope.quoteIndex) {
        return;
      }

      if ($scope.isEditInprogress == true) {
        return;
      }

      if (
        $scope.isEditInprogress == false &&
        $scope.currentlyEditWidgetSettingId > 0
      ) {
        $scope.clearEdit($scope.currentlyEditWidgetSettingId);
        $scope.currentlyEditWidgetSettingId = 0;
      }

      if (pageTimeout) {
        $interval.cancel(pageTimeout);
      }

      var allPageElements = $("#pageTransition").children("div");
      angular.forEach(allPageElements, function (div) {
        div.style.removeProperty("visibility");
        div.style.removeProperty("opacity");
        div.style.removeProperty("position");
        div.style.removeProperty("left");
        div.style.zIndex = "998";
        div.classList.remove("image-loaded");
      });

      $scope.quoteIndex = targetPageIndex;
      $scope.pageCounter = 0;
      $scope.checkAndUpdatePageBg();
      $scope.showCurrentPageImageWidget();
      if ($scope.quoteIndex > 0) {
        $scope.resizeIframeWidget($scope.quoteIndex);
      }

      $scope.delayTime = $scope.groups[$scope.quoteIndex].delay;
      $scope.pinnedWidgetId = $scope.groups[$scope.quoteIndex].pinnedWidegtId;
      $timeout($scope.autoResizeByPageNumber($scope.quoteIndex));

      var selectedPage = $scope.groups[$scope.quoteIndex];
      if (selectedPage != undefined) {
        var selectedPageElement = document.getElementById(selectedPage.pageId);
        if (selectedPageElement) {
          selectedPageElement.classList.add("image-loaded");
          selectedPageElement.style.zIndex = "999";
        }
      }

      if ($scope.shouldAutoRotatePages()) {
        pageTimeout = $interval($scope.checkPageTimeOut, 1000);
      }
    };

    $scope.updatePageTransitionPage = function (event, type) {
      if ($scope.shouldDisableGestureAndClickEvents()) {
        return;
      }
      if ($scope.isEditInprogress == true) {
        return;
      }

      if (
        $scope.isEditInprogress == false &&
        $scope.currentlyEditWidgetSettingId > 0
      ) {
        $scope.clearEdit($scope.currentlyEditWidgetSettingId);
        $scope.currentlyEditWidgetSettingId = 0;
      }

      if ($scope.gesture.touch_page_swipe) {
        if ($rootScope.isCustomTransition == false) {
          angular.forEach($scope.transitionPage, function (div) {
            div.classList.remove(
              "fade",
              "slideleft",
              "slideright",
              "slideup",
              "slidedown",
              "flip",
              "pop",
              "rotate"
            );
          });
        }
        $rootScope.isCustomTransition = true;
        $scope.pageCounter = 0;
        if (type == "swipeLeft") {
          $scope.nextPage();
        } else if (type == "swipeRight") {
          $scope.previousPage();
        }
      }
    };

    $scope.showscrollLimit = function (widgetSettingId, direction) {
      var element = document.getElementById(
        widgetSettingId + "_" + $scope.quoteIndex + "_glow"
      );
      if (direction == "next") {
        element.style.background =
          "linear-gradient(to bottom, transparent, orange)";
        element.style.removeProperty("top");
        element.style.bottom = "0";
      } else if (direction == "prev") {
        element.style.background =
          "linear-gradient(to top, transparent, orange)";
        element.style.removeProperty("bottom");
        element.style.top = "0";
      }

      $scope.calendarGestureLimit = true;
      $timeout(function () {
        $scope.calendarGestureLimit = false;
      }, 2000);
    };

    $scope.getSwipeScrollDirection = function (type) {
      if (type == "swipeUp") {
        return 1;
      }
      if (type == "swipeDown") {
        return -1;
      }
      return 0;
    };

    $scope.getSwipeEventTarget = function (event) {
      if (!event) {
        return null;
      }
      if (event.target && event.target.nodeType == 1) {
        return event.target;
      }
      if (event.srcEvent) {
        if (event.srcEvent.target && event.srcEvent.target.nodeType == 1) {
          return event.srcEvent.target;
        }
        if (event.srcEvent.srcElement && event.srcEvent.srcElement.nodeType == 1) {
          return event.srcEvent.srcElement;
        }
      }
      return null;
    };

    $scope.matchesSwipeScrollSelector = function (element, selector) {
      if (!element || element.nodeType != 1 || !selector) {
        return false;
      }
      var matches =
        element.matches ||
        element.msMatchesSelector ||
        element.webkitMatchesSelector;
      if (!matches) {
        return false;
      }
      return matches.call(element, selector);
    };

    $scope.getWidgetRootForSwipeScroll = function (event, options) {
      options = options || {};
      var target = $scope.getSwipeEventTarget(event);

      if (options.rootElement) {
        return options.rootElement;
      }

      if (target && options.rootSelector) {
        var selectorRoot = target.closest
          ? target.closest(options.rootSelector)
          : null;
        if (selectorRoot) {
          return selectorRoot;
        }
      }

      if (options.rootId) {
        var rootById = document.getElementById(options.rootId);
        if (rootById) {
          return rootById;
        }
      }

      if (
        options.widgetData &&
        options.widgetData.contentType &&
        options.widgetData.widgetSettingId != undefined
      ) {
        var widgetRoot = document.getElementById(
          options.widgetData.contentType + "_" + options.widgetData.widgetSettingId
        );
        if (widgetRoot && (!target || widgetRoot.contains(target))) {
          return widgetRoot;
        }
      }

      return target;
    };

    $scope.getSwipeScrollTop = function (element) {
      if (!element) {
        return 0;
      }
      var top = parseFloat(element.style.top);
      if (isNaN(top) && window.getComputedStyle) {
        top = parseFloat(window.getComputedStyle(element).top);
      }
      return isNaN(top) ? 0 : top;
    };

    $scope.getMangoMirrorScrollState = function (element) {
      if (!element || !element.classList || !element.classList.contains("-m-scroll-p")) {
        return null;
      }

      var scrollChildren = element.querySelectorAll(".-m-scroll-c");
      if (!scrollChildren || scrollChildren.length == 0) {
        return null;
      }

      var contentHeight = 0;
      Array.prototype.forEach.call(scrollChildren, function (child) {
        var childBottom = child.offsetTop + child.offsetHeight;
        if (childBottom > contentHeight) {
          contentHeight = childBottom;
        }
      });

      var visibleHeight = element.clientHeight;
      if (contentHeight <= visibleHeight + 1) {
        return null;
      }

      var minTop = Math.min(0, visibleHeight - contentHeight);
      return {
        children: scrollChildren,
        currentTop: $scope.getSwipeScrollTop(scrollChildren[0]),
        minTop: minTop,
        maxTop: 0,
      };
    };

    $scope.tryScrollMangoMirrorElement = function (element, direction, distance) {
      var scrollState = $scope.getMangoMirrorScrollState(element);
      if (!scrollState) {
        return false;
      }

      var currentTop = scrollState.currentTop;
      if (currentTop > scrollState.maxTop) {
        currentTop = scrollState.maxTop;
      } else if (currentTop < scrollState.minTop) {
        currentTop = scrollState.minTop;
      }

      var nextTop = currentTop;
      if (direction > 0) {
        if (currentTop <= scrollState.minTop + 1) {
          return false;
        }
        nextTop = Math.max(scrollState.minTop, currentTop - distance);
      } else if (direction < 0) {
        if (currentTop >= scrollState.maxTop - 1) {
          return false;
        }
        nextTop = Math.min(scrollState.maxTop, currentTop + distance);
      }

      if (nextTop == currentTop) {
        return false;
      }

      Array.prototype.forEach.call(scrollState.children, function (child) {
        angular.element(child).stop(true, false);
        child.style.position = "relative";
        child.style.visibility = "inherit";
        child.style.top = nextTop + "px";
      });

      return true;
    };

    $scope.tryScrollNativeElement = function (element, direction, distance) {
      if (!element) {
        return false;
      }

      var maxTop = element.scrollHeight - element.clientHeight;
      if (maxTop <= 1) {
        return false;
      }

      var currentTop = element.scrollTop;
      var nextTop = currentTop;
      if (direction > 0) {
        if (currentTop >= maxTop - 1) {
          return false;
        }
        nextTop = Math.min(maxTop, currentTop + distance);
      } else if (direction < 0) {
        if (currentTop <= 1) {
          return false;
        }
        nextTop = Math.max(0, currentTop - distance);
      }

      if (nextTop == currentTop) {
        return false;
      }

      element.scrollTop = nextTop;
      return element.scrollTop != currentTop;
    };

    $scope.getSwipeScrollCandidates = function (rootElement, target, options) {
      options = options || {};
      var selectors =
        options.scrollSelectors ||
        [
          ".-m-scroll-p",
          ".fc-scroller-liquid",
          ".fc-scroller-liquid-absolute",
          ".fc-scroller",
          ".fc-daygrid-day-frame",
          ".fc-daygrid-day-events",
          ".scrollable-container",
          "[data-mm-scrollable='true']",
          "[data-scrollable='true']",
        ];
      var candidates = [];

      var addCandidate = function (element) {
        if (!element || element.nodeType != 1) {
          return;
        }
        if (rootElement && element !== rootElement && !rootElement.contains(element)) {
          return;
        }
        if (candidates.indexOf(element) == -1) {
          candidates.push(element);
        }
      };

      var node = target;
      while (node && node.nodeType == 1) {
        for (var i = 0; i < selectors.length; i++) {
          if ($scope.matchesSwipeScrollSelector(node, selectors[i])) {
            addCandidate(node);
            break;
          }
        }
        if (node == rootElement) {
          break;
        }
        node = node.parentElement;
      }

      if (rootElement && rootElement.querySelectorAll) {
        var selectorText = selectors.join(",");
        var descendants = rootElement.querySelectorAll(selectorText);
        Array.prototype.forEach.call(descendants, addCandidate);
      }

      return candidates;
    };

    $scope.tryScrollWidgetOnSwipe = function (event, type, options) {
      var direction = $scope.getSwipeScrollDirection(type);
      if (direction == 0) {
        return false;
      }

      options = options || {};
      var rootElement = $scope.getWidgetRootForSwipeScroll(event, options);
      if (!rootElement) {
        return false;
      }

      var target = $scope.getSwipeEventTarget(event);
      var distance =
        options.scrollDistance ||
        Math.max(80, Math.floor((rootElement.clientHeight || 0) * 0.65));
      var candidates = $scope.getSwipeScrollCandidates(
        rootElement,
        target,
        options
      );

      for (var i = 0; i < candidates.length; i++) {
        if (
          $scope.tryScrollMangoMirrorElement(candidates[i], direction, distance) ||
          $scope.tryScrollNativeElement(candidates[i], direction, distance)
        ) {
          return true;
        }
      }

      return false;
    };

    $scope.updateCalendarView = function (event, type, data) {
      var isRemoteArrowDoubleTap =
        event && event.mangoMirrorRemoteGesture === "arrowDoubleTap";
      if (window.console && console.log) {
        console.log("[CalendarDoubleTap] updateCalendarView called", {
          eventType: event && event.type,
          swipeType: type,
          remoteGesture: event && event.mangoMirrorRemoteGesture,
          skipSwipeScroll: isRemoteArrowDoubleTap,
          targetId: event && event.target && event.target.id,
          targetClass: event && event.target ? event.target.className : undefined,
          widgetSettingId: data && data.widgetSettingId,
          touchCalendarScroll:
            $scope.gesture && $scope.gesture.touch_calendar_scroll,
          initialDate: data && data.data && data.data.initial_date,
        });
      }
      if ($scope.gesture.touch_calendar_scroll) {
        if (
          !isRemoteArrowDoubleTap &&
          $scope.tryScrollWidgetOnSwipe(event, type, {
            widgetData: data,
          })
        ) {
          return;
        }

        if (type == "swipeUp") {
          var date = $scope.getInitialDate(data, "next");
          if (date == null) {
            $scope.showscrollLimit(data.widgetSettingId, "next");
          } else {
            $scope.getCalendarData(data, date);
          }
        } else if (type == "swipeDown") {
          var date = $scope.getInitialDate(data, "prev");
          if (date == null) {
            $scope.showscrollLimit(data.widgetSettingId, "prev");
          } else {
            $scope.getCalendarData(data, date);
          }
        }
      }
    };

    $scope.getInitialDate = function (calendarData, type) {
      // Get the first date of the current month
      var firstDateOfMonth = moment().startOf("month");
      var swipeLimitDate = moment(firstDateOfMonth).add(
        calendarData.data.event_to_date || 90,"days"
      );
      var fromDate = "";
      var date = moment(calendarData.data.initial_date);
      var monthStep = 1;
      var yearlyMonthStep = 1;
      var weekStep = calendarData.data.calendarWidgetFormat.w_weeksToShow;

      if (
        calendarData.data.calendarWidgetFormat.calendarType == "Monthly" &&
        calendarData.data.calendarWidgetFormat.isMultiMonthView == true &&
        calendarData.data.calendarWidgetFormat.m_selectedMonths
      ) {
        try {
          var selectedMonths = JSON.parse(
            calendarData.data.calendarWidgetFormat.m_selectedMonths
          );
          if (Array.isArray(selectedMonths) && selectedMonths.length > 0) {
            monthStep = selectedMonths.length;
          }
        } catch (e) {
          monthStep = 1;
        }
      }

      if (
        calendarData.data.calendarWidgetFormat.calendarType == "Weeks" &&
        calendarData.data.calendarWidgetFormat.w_selectedWeeks
      ) {
        try {
          var selectedWeeks = JSON.parse(
            calendarData.data.calendarWidgetFormat.w_selectedWeeks
          );
          if (Array.isArray(selectedWeeks) && selectedWeeks.length > 0) {
            weekStep = selectedWeeks.length;
          }
        } catch (e) {
          weekStep = calendarData.data.calendarWidgetFormat.w_weeksToShow;
        }
      }

      if (calendarData.data.calendarWidgetFormat.calendarType == "Yearly") {
        var yearlyFormat = calendarData.data.calendarWidgetFormat;
        var isYearlyCalendarEnabled =
          yearlyFormat.isYearlyCalendarEnabled === true ||
          yearlyFormat.isYearlyCalendarEnabled === "true";

        if (isYearlyCalendarEnabled) {
          yearlyMonthStep = 12;
        } else if (yearlyFormat.y_selectedMonths) {
          try {
            var selectedYearMonths = JSON.parse(yearlyFormat.y_selectedMonths);
            if (
              Array.isArray(selectedYearMonths) &&
              selectedYearMonths.length > 0
            ) {
              yearlyMonthStep = selectedYearMonths.length;
            }
          } catch (e) {
            yearlyMonthStep = 1;
          }
        }
      }

      if (type == "next") {
        if (calendarData.data.calendarWidgetFormat.calendarType == "Monthly") {
          date.add(monthStep, "months");
          fromDate = date.format("YYYY-MM-DD");
        }
        if (calendarData.data.calendarWidgetFormat.calendarType == "Yearly") {
          date.add(yearlyMonthStep, "months");
          fromDate = date.format("YYYY-MM-DD");
        }
        if (calendarData.data.calendarWidgetFormat.calendarType == "Weeks") {
          date.add(7 * weekStep, "days");
          fromDate = date.format("YYYY-MM-DD");
        }
        if (calendarData.data.calendarWidgetFormat.calendarType == "Schedule") {
          if (
            calendarData.data.calendarWidgetFormat.schedule_days_selection ==
            "current_week"
          ) {
            date.add(7, "days");
            fromDate = date.format("YYYY-MM-DD");
          } else {
            date.add(1, "days");
            fromDate = date.format("YYYY-MM-DD");
          }
        }
        if (calendarData.data.calendarWidgetFormat.calendarType == "List") {
          if (
            calendarData.data.calendarWidgetFormat.list_event_type ==
            "next_x_days"
          ) {
            date.add(
              calendarData.data.calendarWidgetFormat.list_no_days,
              "days"
            );
            fromDate = date.format("YYYY-MM-DD");
          } else {
            date.add(1, "days");
            fromDate = date.format("YYYY-MM-DD");
          }
        }

        if (date.isBefore(swipeLimitDate)) {
          return fromDate;
        }
      } else {
        if (calendarData.data.calendarWidgetFormat.calendarType == "Monthly") {
          date.subtract(monthStep, "months");
          fromDate = date.format("YYYY-MM-DD");
        }
        if (calendarData.data.calendarWidgetFormat.calendarType == "Yearly") {
          date.subtract(yearlyMonthStep, "months");
          fromDate = date.format("YYYY-MM-DD");
        }
        if (calendarData.data.calendarWidgetFormat.calendarType == "Weeks") {
          date.subtract(7 * weekStep, "days");
          fromDate = date.format("YYYY-MM-DD");
        }
        if (calendarData.data.calendarWidgetFormat.calendarType == "Schedule") {
          if (
            calendarData.data.calendarWidgetFormat.schedule_days_selection ==
            "current_week"
          ) {
            date.subtract(7, "days");
            fromDate = date.format("YYYY-MM-DD");
          } else {
            date.subtract(1, "days");
            fromDate = date.format("YYYY-MM-DD");
          }
        }
        if (calendarData.data.calendarWidgetFormat.calendarType == "List") {
          if (
            calendarData.data.calendarWidgetFormat.list_event_type ==
            "next_x_days"
          ) {
            date.subtract(
              calendarData.data.calendarWidgetFormat.list_no_days,
              "days"
            );
            fromDate = date.format("YYYY-MM-DD");
          } else {
            date.subtract(1, "days");
            fromDate = date.format("YYYY-MM-DD");
          }
        }
        firstDateOfMonth = firstDateOfMonth.subtract(1, "months");
        if (date.isAfter(firstDateOfMonth) || date.isSame(firstDateOfMonth)) {
          return fromDate;
        }
      }
      return null;
    };

    $scope.onTapHold = function (event) {
      if ($scope.shouldDisableGestureAndClickEvents()) {
        return;
      }
      if ($scope.gesture.touch_page_hold) {
        if ($scope.shouldAutoRotatePages()) {
          if (pageTimeout) {
            $interval.cancel(pageTimeout);
          }
        }
      }
    };

    $scope.onTapHoldRelease = function (event) {
      if ($scope.shouldDisableGestureAndClickEvents()) {
        return;
      }
      if ($scope.gesture.touch_page_hold) {
        if ($scope.shouldAutoRotatePages()) {
          if (pageTimeout) {
            $interval.cancel(pageTimeout);
          }
          pageTimeout = $interval($scope.checkPageTimeOut, 1000);
        }
      }
    };

    $scope.clearReverseAnimation = function () {
      $scope.reverseTimeout = $timeout(function () {
        if ($rootScope.isCustomTransition == true) {
          $scope.transitionPage = $("#pageTransition").children("div");
          angular.forEach($scope.transitionPage, function (div, index) {
            div.style.removeProperty("visibility");
            div.style.removeProperty("opacity");
            div.style.removeProperty("position");
            div.style.removeProperty("left");
            var transitionClass = $scope.getPageTransitionClass(
              $scope.groups[index]
            );
            if (transitionClass) {
              div.classList.add(transitionClass);
            }
            if (div.classList.contains("image-loaded")) {
              div.classList.remove("image-loaded");
            }
          });
          document
            .getElementById($scope.groups[$scope.quoteIndex].pageId)
            .classList.add("image-loaded");
        }

        $timeout(function () {
          $rootScope.isCustomTransition = false;
          if (pageTimeout) {
            $interval.cancel(pageTimeout);
          }
          if (
            $scope.shouldAutoRotatePages() &&
            $scope.currentlyEditWidgetSettingId === 0
          ) {
            pageTimeout = $interval($scope.checkPageTimeOut, 1000);
          }
        }, 200);
      }, 3000);
    };

    $scope.updateGesture = function (updatedGesture) {
      if (window.mmPaintedNotify) window.mmPaintedNotify("socket", "gesture", null);
      var parsedGestureData = JSON.parse(updatedGesture);
      $scope.gesture = parsedGestureData.gesture;
    };

    $scope.updateOverlayData = function (updatedOverlay) {
      if (window.mmPaintedNotify) window.mmPaintedNotify("socket", "overlay", null);
      var parsedOverlayData = JSON.parse(updatedOverlay);
      $scope.overlaySetting = parsedOverlayData.overlay;
      $rootScope.updateOverLay();
    };

    //calendar edit related functions
    $scope.clearCalendarEditWindow = function () {
      if ($scope.editTimeout == 0) {
        $scope.clearEdit($scope.currentlyEditWidgetSettingId);
        $scope.currentlyEditWidgetSettingId = 0;
        $interval.cancel($scope.calendarEditInterval);
        if (pageTimeout) {
          $interval.cancel(pageTimeout);
        }
        if ($scope.shouldAutoRotatePages()) {
          pageTimeout = $interval($scope.checkPageTimeOut, 1000);
        }
      }
      if ($scope.isEditInprogress == false && $scope.editTimeout > 0) {
        $scope.editTimeout--;
      }
    };

    $rootScope.showLoadingSpinner = function (widgetId, message) {
      var spinnerelement = document.getElementById(
        widgetId + "_spinnerOverlay"
      );
      $scope.loadingMessage = message;
      if (spinnerelement) {
        spinnerelement.style.display = "flex";
      }
    };

    $rootScope.hideLoadingSpinner = function (widgetId) {
      var spinnerelement = document.getElementById(
        widgetId + "_spinnerOverlay"
      );
      if (spinnerelement) {
        spinnerelement.style.display = "none";
      }
    };

    // on double click notes show green border and add edit button
    $scope.onEditNotes = function ($event, widgetData) {
      // delete green border from previous active selected widget
      $scope.clearEdit($scope.currentlyEditWidgetSettingId);

      if ($scope.gesture.touch_note_edit === false) {
        $scope.toasterMessage(
      		  "For security, notes editing is off by default.<br>" +
      		  "<b>To enable editing:</b><br>" +
      		  "Log into your account and open your display layout. Then navigate to:<br>" +
      		  "Display Settings → Touch, Mouse or TV Remote Control → Modify",
      		  10000
      		);

        return;
      }

      const element = document.getElementById(
        widgetData.widgetSettingId + "_" + $scope.quoteIndex
      );

      element.classList.add("t2pxborder");

      $rootScope.showLoadingSpinner(widgetData.widgetSettingId, "Loading...");

      $scope.currentlyEditWidgetSettingId = widgetData.widgetSettingId;
      $scope.editorEditTimeout = 10;
      $interval.cancel($scope.editorEditInterval);
      $scope.editorEditInterval = $interval($scope.clearNotesEditWindow, 1000);

      if (pageTimeout) {
        $interval.cancel(pageTimeout);
      }

      $scope.openModal(
        null,
        MANGO_MIRROR_CONSTANT.WIDGET_TYPE_STICKYNOTES,
        $scope.notesModal()
      );
    };

    // track notes active state(green border and edit button)
    $scope.clearNotesEditWindow = function () {
      if ($scope.editorEditTimeout == 0) {
        $scope.clearEdit($scope.currentlyEditWidgetSettingId);
        $scope.currentlyEditWidgetSettingId = 0;
        $interval.cancel($scope.editorEditInterval);
        if (pageTimeout) {
          $interval.cancel(pageTimeout);
        }
        if ($scope.shouldAutoRotatePages()) {
          pageTimeout = $interval($scope.checkPageTimeOut, 1000);
        }
      }
      if ($scope.isEditInprogress == false && $scope.editorEditTimeout > 0) {
        $scope.editorEditTimeout--;
      }
    };

    // clear border and remove edit button
    $scope.clearEdit = function (widgetSettingId) {
      var element = document.getElementById(
        widgetSettingId + "_" + $scope.quoteIndex
      );
      if (element != undefined) {
        element.classList.remove("t2pxborder");
        if (document.getElementById(widgetSettingId + "_float_btn") !== null) {
          document.getElementById(
            widgetSettingId + "_float_btn"
          ).style.display = "none";
        }
      }
    };

    $scope.allowCalendarEdit = function ($event, widgetData) {
      if ($scope.gesture.touch_calendar_edit == false) {
        $scope.toasterMessage(
        		"For security, calendar editing is off by default.<br>" +
        		"<b>To enable editing:</b><br>" +
        		"Log into your account and open your display layout. Then navigate to:<br>" +
        		"Display Settings → Touch, Mouse or TV Remote Control → Modify",
        		10000);
        return;
      }
      // delete green border from previous active selected widget
      $scope.clearEdit($scope.currentlyEditWidgetSettingId);
      $timeout(function () {
        //stoped current itterations
        if (widgetData.widgetSettingId == $scope.currentlyEditWidgetSettingId) {
          if (
            $scope.isEditInprogress == true ||
            $scope.eventDetailsInprogress == true
          ) {
            return;
          }

          //stop editing
          $scope.clearEdit(widgetData.widgetSettingId);
          $scope.currentlyEditWidgetSettingId = 0;
          if (
            $scope.shouldAutoRotatePages()
          ) {
            if (pageTimeout) {
              $interval.cancel(pageTimeout);
            }
            pageTimeout = $interval($scope.checkPageTimeOut, 1000);
          }
          return;
        } else if (
          widgetData.widgetSettingId != $scope.currentlyEditWidgetSettingId &&
          $scope.currentlyEditWidgetSettingId > 0
        ) {
          //clear old border
          $scope.clearEdit($scope.currentlyEditWidgetSettingId);
        }

        $scope.currentlyEditWidgetSettingId = widgetData.widgetSettingId;
        $scope.editTimeout = 10;
        $interval.cancel($scope.calendarEditInterval);
        $scope.calendarEditInterval = $interval(
          $scope.clearCalendarEditWindow,
          1000
        );

        if ($scope.gesture.touch_calendar_edit == false) {
          return;
        }
        if (pageTimeout) {
          $interval.cancel(pageTimeout);
        }

        document
          .getElementById(
            $scope.currentlyEditWidgetSettingId + "_" + $scope.quoteIndex
          )
          .classList.add("t2pxborder");
        document.getElementById(
          $scope.currentlyEditWidgetSettingId + "_float_btn"
        ).style.display = "block";
        $scope.getCalendarAccounts($scope.currentlyEditWidgetSettingId);
      }, 400);
    };

    $scope.getCalendarAccounts = function (widgetSettingId) {
      $rootScope.showLoadingSpinner(widgetSettingId);

      APIServices.getCalendarAccounts()
        .success(function (data, status) {
          $scope.calendarAccounts = data.object;
          $rootScope.hideLoadingSpinner(widgetSettingId);
          
          $scope.calendarAccounts = $scope.calendarAccounts.filter(function(account) {
        	  return ["icalAccount", "google", "outlook"].includes(account.calendarType) &&
        	  account.isWriteAccess === true;
        	});
          if ($scope.calendarAccounts.length == 0) {
            $scope.clearEdit(widgetSettingId);
            $scope.toasterMessage(
              "You have't authenticated any account with write access."
            );
          }
        })
        .error(function (data, status) {
          $scope.clearEdit(widgetSettingId);
          $rootScope.hideLoadingSpinner(widgetSettingId);
          console.log("There are some issues while accessing account details");
        });
    };

    $scope.getTodoAccountId = function (account) {
      if (account == undefined) {
        return undefined;
      }

      if (account.todoAccountId != undefined && account.todoAccountId != null) {
        return account.todoAccountId;
      }
      if (account.accountId != undefined && account.accountId != null) {
        return account.accountId;
      }
      if (account.id != undefined && account.id != null) {
        return account.id;
      }

      return undefined;
    };

    $scope.getTodoAccountDisplayValue = function (account, keys) {
      if (account == undefined) {
        return undefined;
      }

      for (var i = 0; i < keys.length; i++) {
        var value = account[keys[i]];
        if (typeof value === "string" && value.trim().length > 0) {
          return value;
        }
      }

      return undefined;
    };

    $scope.getTodoAccountName = function (account, accountIndex) {
      if (account == undefined) {
        return "Account " + accountIndex;
      }

      var displayKeys = [
        "todoAccountName",
        "accountName",
        "sourceAccount",
        "name",
        "displayName",
        "email",
        "emailId",
        "emailAddress",
        "accountEmail",
        "todoAccountEmail",
        "userEmail",
        "sourceEmail",
        "sourceName",
        "todoSource",
        "providerName",
        "title",
      ];
      var displayValue = $scope.getTodoAccountDisplayValue(account, displayKeys);
      if (displayValue != undefined) {
        return displayValue;
      }

      var nestedKeys = [
        "account",
        "todoAccount",
        "accountDetails",
        "todoAccountDetails",
        "source",
        "user",
        "profile",
      ];
      for (var i = 0; i < nestedKeys.length; i++) {
        displayValue = $scope.getTodoAccountDisplayValue(
          account[nestedKeys[i]],
          displayKeys
        );
        if (displayValue != undefined) {
          return displayValue;
        }
      }

      for (var key in account) {
        if (!Object.prototype.hasOwnProperty.call(account, key)) {
          continue;
        }
        var lowerKey = key.toLowerCase();
        var value = account[key];
        var looksLikeName =
          lowerKey.indexOf("name") >= 0 ||
          lowerKey.indexOf("email") >= 0 ||
          lowerKey.indexOf("source") >= 0 ||
          lowerKey.indexOf("account") >= 0;
        var looksUnsafe =
          lowerKey.indexOf("id") >= 0 ||
          lowerKey.indexOf("type") >= 0 ||
          lowerKey.indexOf("token") >= 0 ||
          lowerKey.indexOf("url") >= 0 ||
          lowerKey.indexOf("status") >= 0 ||
          lowerKey.indexOf("access") >= 0 ||
          lowerKey.indexOf("refresh") >= 0 ||
          lowerKey.indexOf("project") >= 0 ||
          lowerKey.indexOf("widget") >= 0;
        if (
          looksLikeName &&
          !looksUnsafe &&
          typeof value === "string" &&
          value.trim().length > 0
        ) {
          return value;
        }
      }

      return "Account " + accountIndex;
    };

    $scope.normalizeTodoAccounts = function (accountResponse) {
      var accounts = [];

      if (angular.isArray(accountResponse)) {
        accounts = accountResponse;
      } else if (accountResponse != undefined && angular.isArray(accountResponse.object)) {
        accounts = accountResponse.object;
      } else if (
        accountResponse != undefined &&
        accountResponse.object != undefined &&
        angular.isArray(accountResponse.object.todoAccounts)
      ) {
        accounts = accountResponse.object.todoAccounts;
      } else if (
        accountResponse != undefined &&
        accountResponse.object != undefined &&
        angular.isArray(accountResponse.object.accounts)
      ) {
        accounts = accountResponse.object.accounts;
      } else if (
        accountResponse != undefined &&
        angular.isArray(accountResponse.todoAccounts)
      ) {
        accounts = accountResponse.todoAccounts;
      } else if (
        accountResponse != undefined &&
        angular.isArray(accountResponse.accounts)
      ) {
        accounts = accountResponse.accounts;
      }

      return accounts;
    };

    $scope.getTodoAccounts = function (widgetData) {
      var widgetSettingId = widgetData.widgetSettingId;

      $scope.todoAccounts = [];
      $scope.todoAccountsError = null;

      $rootScope.showLoadingSpinner(widgetSettingId);

      APIServices.getTodoAccounts(widgetSettingId)
        .success(function (data, status) {
          $rootScope.hideLoadingSpinner(widgetSettingId);

          if ($scope.pendingTodoWidgetSettingId != widgetSettingId) {
            return;
          }

          $scope.todoAccounts = $scope.normalizeTodoAccounts(data);
          if ($scope.todoAccounts.length == 0) {
            $scope.todoAccountsError = {
              widgetSettingId: widgetSettingId,
              message: "You haven't authenticated any todo account.",
            };
            $scope.pendingTodoWidgetSettingId = 0;
            $scope.clearEdit(widgetSettingId);
            $scope.toasterMessage($scope.todoAccountsError.message);
            return;
          }

          $scope.pendingTodoWidgetSettingId = 0;
          $scope.currentlyEditWidgetSettingId = widgetSettingId;
          $scope.editTimeout = 10;
          $interval.cancel($scope.calendarEditInterval);
          $scope.calendarEditInterval = $interval(
            $scope.clearCalendarEditWindow,
            1000
          );

          if (pageTimeout) {
            $interval.cancel(pageTimeout);
          }

          var element = document.getElementById(
            widgetSettingId + "_" + $scope.quoteIndex
          );
          if (element != undefined) {
            element.classList.add("t2pxborder");
          }

          var floatButton = document.getElementById(widgetSettingId + "_float_btn");
          if (floatButton != undefined) {
            floatButton.style.display = "block";
          }
        })
        .error(function (data, status) {
          var errorMessage =
            data && data.error && data.error.message
              ? data.error.message
              : data && data.message
              ? data.message
              : typeof data === "string" && data.trim().length > 0
              ? data
              : "Something went wrong while retrieving todo account details.";

          $rootScope.hideLoadingSpinner(widgetSettingId);

          if ($scope.pendingTodoWidgetSettingId != widgetSettingId) {
            return;
          }

          $scope.todoAccounts = [];
          $scope.todoAccountsError = {
            widgetSettingId: widgetSettingId,
            message: errorMessage,
          };
          $scope.pendingTodoWidgetSettingId = 0;
          $scope.clearEdit(widgetSettingId);
          $scope.toasterMessage(errorMessage);
        });
    };

    $scope.eventAdd = function (calendarData) {
      if ($scope.calendarAccounts.length > 0) {
        calendarData.isEdit = false;
        $scope.openModal(
          calendarData,
          MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CALENDAR,
          $scope.calendarModal()
        );
      } else {
        $scope.toasterMessage(
          "Please make sure one of your account have write permission."
        );
      }
    };

    $scope.isTodoEditDisabled = function () {
      return (
        $scope.gesture == undefined ||
        $scope.gesture.touch_todo_edit == false ||
        $scope.gesture.touch_todo_edit == undefined
      );
    };

    $scope.showTodoEditDisabledMessage = function () {
      $scope.toasterMessage(
        "For security, todo editing is off by default.<br>" +
          "<b>To enable editing:</b><br>" +
          "Log into your account and open your display layout. Then navigate to:<br>" +
          "Display Settings &rarr; Touch, Mouse or TV Remote Control &rarr; Modify",
        10000
      );
    };

    $scope.allowTodoEdit = function ($event, widgetData) {
      if ($scope.isTodoEditDisabled()) {
        $scope.showTodoEditDisabledMessage();
        return;
      }

      $scope.clearEdit($scope.currentlyEditWidgetSettingId);
      $timeout(function () {
        if (widgetData.widgetSettingId == $scope.currentlyEditWidgetSettingId) {
          if (
            $scope.isEditInprogress == true ||
            $scope.todoTaskDetailsInprogress == true
          ) {
            return;
          }

          $scope.clearEdit(widgetData.widgetSettingId);
          $scope.currentlyEditWidgetSettingId = 0;
          $scope.pendingTodoWidgetSettingId = 0;
          $scope.todoAccounts = [];
          $scope.todoAccountsError = null;
          if ($scope.shouldAutoRotatePages()) {
            if (pageTimeout) {
              $interval.cancel(pageTimeout);
            }
            pageTimeout = $interval($scope.checkPageTimeOut, 1000);
          }
          return;
        } else if (
          widgetData.widgetSettingId != $scope.currentlyEditWidgetSettingId &&
          $scope.currentlyEditWidgetSettingId > 0
        ) {
          $scope.clearEdit($scope.currentlyEditWidgetSettingId);
        }

        if ($scope.pendingTodoWidgetSettingId == widgetData.widgetSettingId) {
          return;
        }

        $scope.currentlyEditWidgetSettingId = 0;
        $scope.pendingTodoWidgetSettingId = widgetData.widgetSettingId;
        $scope.todoAccounts = [];
        $scope.todoAccountsError = null;
        $scope.getTodoAccounts(widgetData);
      }, 400);
    };

    $scope.isTodoWidgetEditable = function (widgetData, showMessage) {
      if ($scope.isTodoEditDisabled()) {
        if (showMessage) {
          $scope.showTodoEditDisabledMessage();
        }
        return false;
      }

      if (
        widgetData == undefined ||
        widgetData.widgetSettingId != $scope.currentlyEditWidgetSettingId
      ) {
        if (showMessage) {
          $scope.toasterMessage("Double tap the todo widget before editing tasks.");
        }
        return false;
      }

      return true;
    };

    $scope.todoTaskAdd = function (widgetData) {
      if (
        $scope.todoAccountsError != null &&
        widgetData != undefined &&
        $scope.todoAccountsError.widgetSettingId == widgetData.widgetSettingId
      ) {
        $scope.toasterMessage($scope.todoAccountsError.message);
        return;
      }

      if (!$scope.isTodoWidgetEditable(widgetData, true)) {
        return;
      }

      if ($scope.todoAccounts.length == 0) {
        $scope.toasterMessage("Please make sure todo account details are available.");
        return;
      }

      var todoWidgetData = {
        isEdit: false,
        widgetSettingId: widgetData.widgetSettingId,
        data: {
          selected_projects: widgetData.data.selected_projects,
        },
      };
      $scope.openModal(
        todoWidgetData,
        MANGO_MIRROR_CONSTANT.WIDGET_TYPE_TODO,
        $scope.todoModal()
      );
    };

    $scope.todoTaskEdit = function (todoTask, widgetData, $event) {
      if ($event != undefined) {
        $event.stopPropagation();
      }

      if (
        widgetData == undefined ||
        widgetData.widgetSettingId != $scope.currentlyEditWidgetSettingId
      ) {
        $scope.openModal(
          {
            task: angular.copy(todoTask),
            project: $scope.getTodoProjectForTask(todoTask, widgetData),
          },
          "todo-view-task",
          $scope.viewTodoTaskModal()
        );
        return;
      }

      if ($scope.todoTaskDetailsInprogress == true) {
        return;
      }

      if (!$scope.isTodoWidgetEditable(widgetData, false)) {
        return;
      }

      if ($scope.todoAccounts.length == 0) {
        if (
          $scope.todoAccountsError != null &&
          $scope.todoAccountsError.widgetSettingId == widgetData.widgetSettingId
        ) {
          $scope.toasterMessage($scope.todoAccountsError.message);
        } else {
          $scope.toasterMessage("Please make sure todo account details are available.");
        }
        return;
      }

      var payload = {
        id: todoTask.id,
        taskId: todoTask.taskId,
        projectId: todoTask.projectId,
        status : todoTask.status,
        todoAccountId: todoTask.todoAccountId,
        timeZone: $scope.timeZoneId,
      };
      $scope.todoTaskDetailsInprogress = true;
      $rootScope.showLoadingSpinner(
        widgetData.widgetSettingId,
        "Please wait...."
      );
      $scope
        .getTodoTaskDetails(payload)
        .then(function (result) {
          var selectedTask = angular.copy(result || todoTask);
          selectedTask.id = selectedTask.id || todoTask.id;
          selectedTask.taskId = selectedTask.taskId || todoTask.taskId;
          selectedTask.projectId = selectedTask.projectId || todoTask.projectId;
          selectedTask.todoAccountId =
            selectedTask.todoAccountId || todoTask.todoAccountId;
          selectedTask.parentTaskId =
            selectedTask.parentTaskId || todoTask.parentTaskId;
          selectedTask.isEdit = true;
          selectedTask.widgetData = widgetData;
          $scope.openModal(
            selectedTask,
            MANGO_MIRROR_CONSTANT.WIDGET_TYPE_TODO,
            $scope.todoModal()
          );
        })
        .finally(function () {
          $scope.todoTaskDetailsInprogress = false;
          $rootScope.hideLoadingSpinner(widgetData.widgetSettingId);
        });
    };

    $scope.getTodoProjectForTask = function (todoTask, widgetData) {
      var selectedProjects =
        widgetData && widgetData.data ? widgetData.data.selected_projects : [];

      for (var i = 0; i < selectedProjects.length; i++) {
        if (
          selectedProjects[i].projectId == todoTask.projectId &&
          $scope.getTodoAccountId(selectedProjects[i]) == todoTask.todoAccountId
        ) {
          return angular.copy(selectedProjects[i]);
        }
      }

      for (var j = 0; j < selectedProjects.length; j++) {
        if (selectedProjects[j].projectId == todoTask.projectId) {
          return angular.copy(selectedProjects[j]);
        }
      }

      return {};
    };

    $scope.notesModal = function () {
      return {
        templateUrl: "templates/stickyNotesModal.html", // Path to your modal HTML file
        controller: "NotesModalCtrl",
        backdrop: "static", // Optional, keeps the modal open even if the user clicks outside
        windowClass: "invisible-modal",
      };
    };

    $scope.todoModal = function () {
      return {
        templateUrl: "templates/todoTaskUpdate.html?v=due-date-toggle",
        controller: "TodoModalCtrl",
        backdrop: "static",
      };
    };

    $scope.viewTodoTaskModal = function () {
      return {
        templateUrl: "templates/viewTodoTask.html",
        controller: "ViewTodoTaskModalCtrl",
        backdrop: "static",
      };
    };

    $scope.calendarModal = function () {
      return {
        templateUrl: "templates/eventUpdate.html", // Path to your modal HTML file
        controller: "CalendarModalCtrl",
        backdrop: "static", // Optional, keeps the modal open even if the user clicks outside
      };
    };

    $scope.viewCalendarEventModal = function () {
      return {
        templateUrl: "templates/viewEvent.html", // Path to your modal HTML file
        controller: "ViewEventModalCtrl",
        backdrop: "static", // Optional, keeps the modal open even if the user clicks outside
      };
    };

    $scope.getResolvedData = function (widgetType, data) {
      switch (widgetType) {
        case MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CALENDAR:
          return $scope.calendarModalResolvedData(data);
        case MANGO_MIRROR_CONSTANT.WIDGET_TYPE_TODO:
          return $scope.todoModalResolvedData(data);
        case MANGO_MIRROR_CONSTANT.WIDGET_TYPE_STICKYNOTES:
          return $scope.notesModalResolvedData();
        case "calendar-view-event":
          return $scope.viewEventModalResolvedData(data);
        case "todo-view-task":
          return $scope.viewTodoTaskModalResolvedData(data);
        default:
          return;
      }
    };

    $scope.viewEventModalResolvedData = function (data) {
      data.eventType = $scope.eventType;
      return {
        data: data,
      };
    };

    $scope.viewTodoTaskModalResolvedData = function (data) {
      return {
        data: data,
      };
    };

    $scope.notesModalResolvedData = function () {
      return {
        widgetSettingId: $scope.currentlyEditWidgetSettingId,
        mirrorId: $scope.mirrorId,
        userMirrorId: $scope.userMirrorId,
      };
    };

    $scope.todoModalResolvedData = function (todoData) {
      var widgetData = todoData.isEdit ? todoData.widgetData : todoData;
      return {
        taskData: function () {
          if (!todoData.isEdit) {
            return null;
          }
          var taskData = angular.copy(todoData);
          delete taskData.widgetData;
          return taskData;
        },
        selectedProjects: function () {
          return angular.copy(
            widgetData && widgetData.data ? widgetData.data.selected_projects : []
          );
        },
        accountList: function () {
          return angular.copy($scope.todoAccounts);
        },
        isEdit: function () {
          return todoData.isEdit;
        },
        displayTimeZone: function () {
          return $scope.timeZoneId;
        },
        widgetSettingId: function () {
          return $scope.currentlyEditWidgetSettingId;
        },
      };
    };

    $scope.calendarModalResolvedData = function (calendarData) {
      return {
        eventData: function () {
          if (calendarData.isEdit) {
            return calendarData;
          } else {
            return null;
          }
        },
        accountList: function () {
          return angular.copy($scope.calendarAccounts);
        },
        selectedCalendar: function () {
          if (calendarData.isEdit) {
            return [calendarData.calendar];
          } else {
            return calendarData.selected_calendar;
          }
        },
        isEdit: function () {
          return calendarData.isEdit;
        },
        displayTimeZone: function () {
          return $scope.timeZoneId;
        },
        widgetSettingId: function () {
          return $scope.currentlyEditWidgetSettingId;
        },
      };
    };

    $scope.openModal = function (data, widgetType, modalInfo) {
      if (widgetType === MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CALENDAR) {
        if (data.isEdit === true && data.calendar.accessRole === "reader") {
          $scope.toasterMessage(
            "Please check the calendar permission before next try."
          );
          $scope.isEditInprogress = false;
          return;
        }
      }

      $scope.isEditInprogress = true;
      $scope.editTimeout = 10;

      var modalInstance = $uibModal.open({
        templateUrl: modalInfo.templateUrl, // Path to your modal HTML file
        controller: modalInfo.controller,
        backdrop: modalInfo.backdrop,
        appendTo: angular.element(document.querySelector("#main")),
        windowClass: modalInfo.windowClass ? modalInfo.windowClass : "", // Optional, keeps the modal open even if the user clicks outside
        resolve: $scope.getResolvedData(widgetType, data),
      });
      modalInstance.result.then(
        function (eventData) {
          if (widgetType === MANGO_MIRROR_CONSTANT.WIDGET_TYPE_CALENDAR) {
            // Handle the data when modal is closed with a result (on save)
            $scope.updateEvent(eventData);
            $scope.isEditInprogress = false;
          } else if (widgetType === MANGO_MIRROR_CONSTANT.WIDGET_TYPE_TODO) {
            $scope.updateTodoTask(eventData);
            $scope.isEditInprogress = false;
          }
        },
        function (ex) {
          if (widgetType === MANGO_MIRROR_CONSTANT.WIDGET_TYPE_STICKYNOTES) {
            if ($scope.shouldAutoRotatePages()) {
              pageTimeout = $interval($scope.checkPageTimeOut, 1000);
            }
            $scope.clearEdit($scope.currentlyEditWidgetSettingId);
          }
          console.log("Event saved:", ex);
          $scope.isEditInprogress = false;
        }
      );
    };

    $scope.getEventDetails = function (data) {
      return APIServices.getEvent(data)
        .then(function (response) {
          var result = response.data.object;
          return result;
        })
        .catch(function (error) {
          $scope.toasterMessage(
            "Something went wrong while retreiving event details."
          );
          return $q.reject(error);
        });
    };

    $scope.getTodoTaskDetails = function (data) {
      return APIServices.getTodoTask(data)
        .then(function (response) {
          return response.data.object;
        })
        .catch(function (error) {
          $scope.toasterMessage(
            "Something went wrong while retreiving todo task details."
          );
          return $q.reject(error);
        });
    };

    $scope.getTodoAccountById = function (todoAccountId) {
      for (var i = 0; i < $scope.todoAccounts.length; i++) {
        if ($scope.getTodoAccountId($scope.todoAccounts[i]) == todoAccountId) {
          return $scope.todoAccounts[i];
        }
      }

      return null;
    };

    $scope.updateGoogleTodoDataByAccountAndProject = function (data) {
      if (data == undefined || data == null) {
        return;
      }

      var todoAccount = $scope.getTodoAccountById(data.todoAccountId);

      if (
        todoAccount == null ||
        String(todoAccount.accountType).toLowerCase() != "google" ||
        data.projectId == undefined ||
        data.projectId == null ||
        String(data.projectId).trim().length == 0
      ) {
        return;
      }

      APIServices.updateTodoDataByAccountAndProject({
        todoAccountId: data.todoAccountId,
        projectId: data.projectId,
      }).catch(function (error) {
        console.log(error);
      });
    };

    $scope.getCalendarDetails = function (data) {
      return APIServices.getCalendarDetails(data)
        .then(function (response) {
          var result = response.data.object;
          return result;
        })
        .catch(function (error) {
          $scope.toasterMessage(
            "Something went wrong to retrieve calendar details"
          );
          return $q.reject(error);
        });
    };

    $scope.updateEvent = function (data1) {
      $rootScope.showLoadingSpinner(
        $scope.currentlyEditWidgetSettingId,
        "updating calendar, please wait..."
      );

      APIServices.updateEvent(data1)
        .success(function (data, status) {
          if (data1.calendarType == "icalAccount") {
            $scope.updateIcalInterval();
          }
          $timeout(function () {
            $rootScope.hideLoadingSpinner($scope.currentlyEditWidgetSettingId);
          }, 5000);
        })
        .error(function (data, status) {
          $rootScope.hideLoadingSpinner($scope.currentlyEditWidgetSettingId);
          $scope.toasterMessage("Something went wrong");
        });
    };

    $scope.updateTodoTask = function (payload) {
      var widgetSettingId = $scope.currentlyEditWidgetSettingId;

      $rootScope.showLoadingSpinner(
        widgetSettingId,
        "updating todo, please wait..."
      );

      APIServices.updateTodoEvent(payload)
        .success(function (data, status) {
          $timeout(function () {
            $rootScope.hideLoadingSpinner(widgetSettingId);
          }, 5000);
          $scope.updateGoogleTodoDataByAccountAndProject(payload);
        })
        .error(function (data, status) {
          $rootScope.hideLoadingSpinner(widgetSettingId);
          $scope.toasterMessage("Something went wrong");
        });
    };

    // Cleanup event listener when scope is destroyed
    $scope.$on("$destroy", function () {
      angular.element($window).off("resize");
      document.removeEventListener("keydown", $scope.onKeyDown);
      $scope.releaseScreenWakeLock();
      if($scope.fvTimer) {
          $timeout.cancel($scope.fvTimer);
      }
    });

    // Add resize event listener
    angular.element($window).on("resize", function () {
      if ($scope.currentOrientation == 0) {
        let currentHeight = 0;
        let currentWidth = 0;

        var userAgent = window.navigator.userAgent.toLowerCase();
        var wv = /wv/.test(userAgent);

        if (wv == false) {
          if (
            window.innerWidth !== undefined &&
            window.innerHeight !== undefined
          ) {
            currentHeight = window.innerHeight;
            currentWidth = window.innerWidth;
          }
        } else {
          if (
            window.screen.height !== undefined &&
            window.screen.width !== undefined
          ) {
            currentHeight = window.innerHeight;
            currentWidth = window.innerWidth;
          }
        }

        setTimeout(() => {
          if (
            (Math.abs(currentHeight - $scope.bodyHeight) > $scope.tolerance ||
              Math.abs(currentWidth - $scope.bodyWidth) > $scope.tolerance) &&
            $rootScope.isAppInBackground == false
          ) {
            $scope.reloadDisplay();
          }
        }, 2000);
      }
    });

    // Add resize event listener
    angular.element($window).on("orientationchange", function () {
      if ($scope.currentOrientation == 0) {
        $scope.reloadDisplay();
      }
    });

    $scope.reloadDisplay = function () {
      clearTimeout($scope.resizeTimeout);
      // small debounce to prevent firing twice
      $scope.resizeTimeout = setTimeout(() => {
        window.location.reload();
      }, 200);
    };

    // added chores new logic for profile image
    $scope.getTopTextData = function (value, widgetData) {
      return {
        reward: value.selectedLabel.reward || "",
        points: value.selectedLabel.points || 0,
        currency: widgetData.data.currency || "",
      };
    };

    $scope.getBottomTextData = function (key, value, widgetData) {
      return {
        label: key || "",
        points: value.selectedLabel.pointBalance || 0,
        currency: widgetData.data.currency || "",
      };
    };

    $scope.getReducedHeight = function (
      currentHeight,
      widgetFormat,
      selectedLabel
    ) {
      try {
        const parsedWidgetFormat = JSON.parse(widgetFormat);
        if (selectedLabel.avatar == undefined || selectedLabel.avatar == "") {
          var size = 0;
          if (
            selectedLabel.reward != undefined ||
            selectedLabel.reward != null
          ) {
            size = size + 20 + parsedWidgetFormat.chores_reward.fontSize * 1.5;
          }

          if (
            selectedLabel.labelName != undefined ||
            selectedLabel.labelName != null
          ) {
            size = size + 10 + parsedWidgetFormat.label.fontSize * 1.5;
          }
          return Math.round(currentHeight - size);
        } else {
          var bottomFontSize = parsedWidgetFormat.label.fontSize;
          var topFontSize = parsedWidgetFormat.chores_reward.fontSize;
          var radius = parsedWidgetFormat.chores_image.fontSize / 2;
          const bottomRibbonWidth = Math.min(
            Math.max(bottomFontSize + 8, 10),
            60
          );
          const topRibbonWidth = Math.min(Math.max(topFontSize + 8, 10), 60);
          const maxRibbonWidth = Math.max(bottomRibbonWidth, topRibbonWidth);
          const padding = maxRibbonWidth + 12;
          const canvasSize = radius * 2 + padding * 2;
          return Math.round(currentHeight - canvasSize);
        }
      } catch (e) {
        return 0; // Fallback if JSON is invalid
      }
    };

    $scope.selectChoresAvatar = function (event, familyGroupLabel) {
      document
        .querySelectorAll(".chores-avatar.selected")
        .forEach((a) => a.classList.remove("selected"));
      event.currentTarget.classList.add("selected");
      if (
        $scope.selectedFamilyLabel != null &&
        familyGroupLabel.todoAccountId ==
          $scope.selectedFamilyLabel.todoAccountId &&
        familyGroupLabel.labelId == $scope.selectedFamilyLabel.labelId
      ) {
        $scope.removeFamilyGroupSelection();
        return;
      }

      $scope.selectedFamilyLabel = familyGroupLabel;
      $scope.selectedChoresAvatarElement = event;
      $timeout.cancel($scope.deselectChoresTimer);
      $scope.deselectChoresTimer = $timeout(function () {
        $scope.removeFamilyGroupSelection();
      }, 20000);
    };

    $scope.removeFamilyGroupSelection = function (event) {
      $timeout.cancel($scope.deselectChoresTimer);
      $scope.selectedChoresAvatarElement.currentTarget.classList.remove(
        "selected"
      );
      $scope.selectedChoresAvatarElement = null;
      $scope.selectedFamilyLabel = null;
    };

    $scope.sendToParent = function (payload) {
      window.parent.postMessage(payload, "*");
    };
  },
]);
