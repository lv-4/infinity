//     (c) 2012 Airbnb, Inc.
//     
//     infinity.js may be freely distributed under the terms of the BSD
//     license. For all licensing information, details, and documentation:
//     http://airbnb.github.com/infinity

!function(window, Math, $) {
  'use strict';


  // Welcome To Infinity
  // ===================
  //
  // infinity.js is a UITableView for the web. Use it to speed up scroll
  // performance of long- or infinitely-scrolling lists of items.
  //
  // infinity.js has several caveats:
  //
  // 1. All DOM elements must either be visible or in the current layout.
  // infinity.js does not support elements that will at some point affect the
  // layout, but are currently hidden using `display:none`.
  //
  // 2. ListViews can't be nested.
  //
  // 3. Non-ListItem elements can't be the immediate children of ListView
  // elements. Only ListItems can be immediate children of ListViews.
  //
  // 4. ListView elements can't have heights set directly on them. In most
  // cases it is also likely that `min-height`s and `max-height`s will break.
  // However, setting heights on ListItems is ok.
  //
  // If you're reading this, we probably want to hear from you. If the feeling
  // is mutual: [get in touch.](http://www.airbnb.com/jobs)


  // Initial Setup
  // =============

  // Cached objects
  var $window = $(window);

  // Packaging:
  var oldInfinity = window.infinity,
      infinity = window.infinity = {},
      config = infinity.config = {};

  // Constants:
  var PAGE_ID_ATTRIBUTE = 'data-infinity-pageid',
      NUM_BUFFER_PAGES = 1,
      PAGES_ONSCREEN = NUM_BUFFER_PAGES * 2 + 1;

  // Config:
  config.PAGE_TO_SCREEN_RATIO = 3;
  config.SCROLL_THROTTLE = 350;
  config.SCROLL_HORIZONTAL_HIJACK = true;
  config.SCROLL_HORIZONTAL_FIXATEPOSITION = false;



  // ListView Class
  // ==============


  // ### Constructor
  //
  // Creates a new instance of a ListView.
  //
  // Takes:
  //
  // - `$el`: a jQuery element.
  // - `options`: an optional hash of options
  //    - `scrollParent`
  //    - `width`
  //    - `height`
  //    - `landscape`
  //    - `itemSizer`

  function ListView($el, options) {
    options = options || {};

    this.$el = $el;
    this.$shadow = blankDiv();

    this.lazy = !!options.lazy;
    this.lazyFn = options.lazy || null;
    this.landscape = options.landscape || false;
    this.itemSelector = options.itemSelector || '> div';
    this.filter = options.filter || '*';

    // The itemSizer is a function used to get the size of a ListItem
    // By using the itemSizer we bypass injecting and detaching the element into/from the DOM
    // to define its size. This will of course only work if ListItems have fixed sizes.
    this.itemSizer = options.itemSizer || null;

    this.items = [];
    this.filteredItems = [];

    var initialItems = extractAndRemoveInitialItems(this);

    initBuffer(this);

    if (this.landscape) {
        this.begin = this.$el.parent().offset().left;
    } else {
        this.begin = this.$el.parent().offset().top;
    }
    // console.log("Initialized listView with begin = %d (landscape = %s)", this.begin, (this.landscape ? 'true' : 'false'));
    this.width = options.width || 0;
    this.height = options.height || 0;

    if (this.landscape && this.height) {
        this.$el.height(this.height);
    } else if (this.width) {
        this.$el.width(this.width);
    }

    this.pages = [];
    this.startIndex = 0;

    this.$scrollParent = options.scrollParent || $window;

    reappendInitialItems(this, initialItems);

    insertPagesInView(this);

    DOMEvent.attach(this);

  }


  // ### extractAndRemoveInitialItems
  //
  // Private ListView method. Finds the initial items contained in a listView based upon its itemSelector and then empties the listView so that it can further initialize.
  // These items will later on be reappended again.

  function extractAndRemoveInitialItems(listView) {

    // Find all items in the element
    var items = listView.$el.find(listView.itemSelector);

    // Empty the element
    listView.$el.empty()

    // Return the items
    return items;

  }


  // ### reappendInitialItems
  //
  // Private ListView method. Appends a given array of items to a given listView

  function reappendInitialItems(listView, items) {

    // Loop all items and add 'm one by one
    items.each(function() {
      listView.append($(this));
    });

  }


  // ### initBuffer
  //
  // Private ListView method. Initializes the buffer element.

  function initBuffer(listView) {
    listView._$buffer = blankDiv()
                        .attr('data-infinity-buffer', '')
                        .prependTo(listView.$el);
  }


  // ### updateBuffer
  //
  // Private ListView method. Updates the buffer to correctly push forward the
  // first page.

  function updateBuffer(listView) {
    var firstPage,
        pages = listView.pages,
        $buffer = listView._$buffer;

    if(pages.length > 0) {
      firstPage = pages[listView.startIndex];
      if (listView.landscape) {
          $buffer.width(firstPage.begin);
      } else {
          $buffer.height(firstPage.begin);
      }
    } else {
      if (listView.landscape) {
          $buffer.width(0);
      } else {
          $buffer.height(0);
      }
    }
  }

  var _itemSurvivesFilter = function(item, filter) {

    if (!filter) return true;

    return item.$el.is(filter);

  }


  ListView.prototype.filterItems = function(filter) {

    var listView = this,
        $scrollRef = $.isWindow(listView.$scrollParent.get(0)) ? $('body') : listView.$scrollParent;

    // Store new filter
    listView.filter = filter

    // As we'll be re-rendering items from scratch we need to reset the size of the ListView and its buffer to 0
    if (listView.landscape) {
      listView.width = 0;
      listView._$buffer.width(0);
    } else {
      listView.height = 0;
      listView._$buffer.height(0);
    }

    // Do loop all items (even if the filter is blank) to make sure all positions are updated!
    var filteredItems = [];
    $.each(listView.items, function(i, item) {
      if (_itemSurvivesFilter(item, filter)) {

        // Manipulate position of item
        if (listView.landscape) {
          item.begin = listView.width;
          item.end = item.begin + item.width;
        } else {
          item.begin = listView.height;
          item.end = item.begin + item.height;
        }

        // Adjust size of ListView itself (so that next item aligns up correctly)
        if (listView.landscape) {
          listView.width += item.width;
        } else {
          listView.height += item.height;
        }

        // Store all properties as data-attributes on the element
        var $listItemEl = item.$el;
        $listItemEl
          .attr('data-infinity-begin', item.begin)
          .attr('data-infinity-end', item.end)
          .attr('data-infinity-width', item.width)
          .attr('data-infinity-height', item.height);

        filteredItems.push(item);
      }
    });
    listView.filteredItems = filteredItems;

    // Adjust size of ListView element
    if (listView.landscape) {
      listView.$el.width(listView.width);
      $scrollRef.animate({ scrollLeft: 0 });
    } else {
      listView.$el.height(listView.height);
      $scrollRef.animate({ scrollTop: 0 });
    }

    // Now that we've filtered our new set of items, repartition
    repartition(listView);

    // Trigger filtered event
    listView.$el.trigger('infinity.filterComplete', {
      filteredItems: listView.filteredItems
    });

  }


  ListView.prototype.sortFilteredItems = function() {

    // @TODO
    console.log('sortFilteredItems');

  }

  ListView.prototype.reset = function() {
    this.setItems();
  }

  ListView.prototype.setItems = function(items) {
    this.items = (!items) ? [] : items;
    this.filterItems(this.filter)
  }

  // ListView manipulation
  // ---------------------


  // ### append
  //
  // Appends a jQuery element or a ListItem to the ListView.
  //
  // Takes:
  //
  // - `obj`: a jQuery element, a string of valid HTML, or a ListItem.
  //
  // TODO: optimized batch appends

  ListView.prototype.append = function(obj) {
    if(!obj || !obj.length) return null;

    var item = convertToItem(this, obj),
        pages = this.pages,
        lastPage = pages[pages.length - 1];

    // Store item on listView for future reference (filtering and sorting)
    this.items.push(item);

    // Item passes the filter: we also need to visually add it
    if (_itemSurvivesFilter(item, this.filter)) {

      // Store it
      this.filteredItems.push(item);

      // Manipulate ListView properties
      if (this.landscape) {
          this.width += item.width;
          this.$el.width(this.width);
      } else {
          this.height += item.height;
          this.$el.height(this.height);
      }

      // Create a new lastPage if needed
      if(!lastPage || !lastPage.hasVacancy()) {
        lastPage = new Page(this);
        pages.push(lastPage);
      }

      // Append item to the lastPage
      lastPage.append(item);

      // insert pages in view
      insertPagesInView(this);

    }

    return item;
  };


  // ### prepend
  //
  // Prepend a jQuery element or a ListItem to the ListView.
  //
  // Takes:
  //
  // - `obj`: a jQuery element, a string of valid HTML, or a ListItem.
  //
  // TODO: optimized batch prepend

  ListView.prototype.prepend = function(obj) {
    if(!obj || !obj.length) return null;

    var firstPage,
        item = convertToItem(this, obj, true),
        pages = this.pages,
        scrollRef = $.isWindow(this.$scrollParent.get(0)) ? document.body : this.$scrollParent.get(0),
        initialScrollSize;

    // Store item on listView for future reference (filtering and sorting)
    this.items.splice(0, 0, item);

    // Item passes the filter: we also need to visually add it
    if (_itemSurvivesFilter(item, this.filter)) {

      // Store it
      this.filteredItems.splice(0, 0, item);

      // Manipulate ListView properties
      if (this.landscape) {
        initialScrollSize = scrollRef.scrollWidth;
        this.width += item.width;
        this.$el.width(this.width);
      } else {
        initialScrollSize = scrollRef.scrollHeight;
        this.height += item.height;
        this.$el.height(this.height);
      }

      // Get references to the first page
      firstPage = pages[0];

      // Create a new firstPage if needed
      if(!firstPage || !firstPage.hasVacancy()) {
        firstPage = new Page(this);
        this.startIndex++;
        pages.splice(0, 0, firstPage);
      }

      // update each page its position with the size of the soon to be inserted item
      updatePagePosition(pages, (this.landscape ? item.width : item.height), 1);

      // Insert it
      firstPage.prepend(item);

      // Update the start index
      updateStartIndex(this, true);

      // Restore scroll position (not 100% glitchfree, disabled by default)
      if (config.SCROLL_HORIZONTAL_FIXATEPOSITION) {
        if (this.landscape) {
          if (initialScrollSize != scrollRef.scrollWidth) {
            $(scrollRef).scrollLeft(($(scrollRef).scrollLeft() + scrollRef.scrollWidth - initialScrollSize));
          }
        } else {
          if (initialScrollSize != scrollRef.scrollHeight) {
            $(scrollRef).scrollTop(($(scrollRef).scrollTop() + scrollRef.scrollHeight - initialScrollSize));
          }
        }
      }

    }

    return item;
  };

  // ### updatePagePosition
  //
  // Update the top/bottom coordinate values for the given array of Pages
  //
  // Takes:
  //
  // - `pages`: array of Pages.
  // - `positionChange`: the change in value to add to all Pages.
  // - `offset`: an offset from the first page to process. Defaults to zero.

  function updatePagePosition(pages, positionChange, offset) {
    var length = pages.length,
        i,
        page;
    for ( i = offset || 0; i < length; i++ ) {
      page = pages[i];
      page.begin += positionChange;
      page.end += positionChange;
      // loop through all page items and update the top/bottom values
      updateItemPosition(page.items, positionChange);
    }
  };

  // ### updateItemPosition
  //
  // Update the top/bottom coordinate values for the given array of ListItems
  //
  // Takes:
  //
  // - `items`: array of ListItems.
  // - `positionChange`: the change in value to add to all ListItems.
  // - `offset`: an offset from the first item to process. Defaults to zero.

  function updateItemPosition(items, positionChange, offset) {
    var length = items.length,
        i,
        item;
    for ( i = offset || 0; i < length; i++ ) {
      item = items[i];
      item.begin += positionChange;
      item.end += positionChange;
    }
  };

  // ### cacheCoordsFor
  //
  // Caches the coordinates for a given ListItem within the given ListView.
  //
  // Takes:
  //
  // - `listView`: a ListView.
  // - `listItem`: the ListItem whose coordinates you want to cache.

  function cacheCoordsFor(listView, listItem, prepend) {

    var elDimensions,
        $listItemEl = listItem.$el;

    // We have an itemSizer function? Use that to define the element dimensions
    if (listView.itemSizer) {
      elDimensions = listView.itemSizer($listItemEl);
    }

    // Dimensions found, set 'm
    if (elDimensions) {
      listItem.width = elDimensions.width;
      listItem.height = elDimensions.height;
    }

    // No dimensions found or no itemSizer? Inject listItem into DOM and use jQuery to define its dimensions
    else {

      $listItemEl.detach();

      if (prepend) {
        listView.$el.prepend($listItemEl);
      } else {
        listView.$el.append($listItemEl);
      }

      if (listView.landscape) {
        listItem.width = $listItemEl.outerWidth(true);
        listItem.height = $listItemEl.height();
      } else {
        listItem.height = $listItemEl.outerHeight(true);
        listItem.width = $listItemEl.width();
      }

      $listItemEl.detach();

    }

    // Now that we have the width/height, we can also define the begin and end coordinates
    if (listView.landscape) {
      listItem.begin = prepend ? 0 : listView.width;
      listItem.end = listItem.begin + listItem.width;
    } else {
      listItem.begin = prepend ? 0 : listView.height;
      listItem.end = listItem.begin + listItem.height;
    }

    // Store all properties as data-attributes on the element
    $listItemEl
      .attr('data-infinity-begin', listItem.begin)
      .attr('data-infinity-end', listItem.end)
      .attr('data-infinity-width', listItem.width)
      .attr('data-infinity-height', listItem.height);


  }


  // ### insertPagesInView
  //
  // Inserts any uninserted pages the given ListView owns.
  //
  // Takes:
  //
  // - `listView`: the ListView whose onscreen pages you'd like to insert.

  function insertPagesInView(listView) {
    var index, length, curr,
        pages = listView.pages,
        inserted = false,
        inOrder = true;
    index = listView.startIndex;
    length = Math.min(index + PAGES_ONSCREEN, pages.length);

    for(index; index < length; index++) {
      curr = pages[index];
      if(listView.lazy) curr.lazyload(listView.lazyFn);
      if(inserted && curr.onscreen) inOrder = false;

      if(!inOrder) {
        curr.stash(listView.$shadow);
        curr.appendTo(listView.$el);
      } else if(!curr.onscreen) {
        inserted = true;
        curr.appendTo(listView.$el);
      }
    }
  }


  // ### updateStartIndex
  //
  // Updates a given ListView when the throttled scroll event fires. Attempts
  // to do as little work as possible: if the `startIndex` doesn't change,
  // it'll exit early. If the `startIndex` does change, it finds all pages
  // that have been scrolled out of view and removes them, then inserts only
  // pages that have been now been scrolled into view.
  //
  // Takes:
  //
  // - `listView`: the ListView needing to be updated.

  function updateStartIndex(listView, prepended) {
    var index, length, pages, lastIndex, nextLastIndex,
        startIndex = listView.startIndex,
        viewRef = listView.$scrollParent;

    if (listView.landscape) {
      var viewLeft = viewRef.scrollLeft() - listView.begin,
          viewWidth = viewRef.width(),
          viewRight = viewLeft + viewWidth,
          nextIndex = startIndexWithinRange(listView, viewLeft, viewRight);
    } else {
      var viewTop = viewRef.scrollTop() - listView.begin,
          viewHeight = viewRef.height(),
          viewBottom = viewTop + viewHeight,
          nextIndex = startIndexWithinRange(listView, viewTop, viewBottom);
    }

    if( nextIndex < 0 || (nextIndex === startIndex && !prepended)) return startIndex;

    pages = listView.pages;
    startIndex = listView.startIndex;
    lastIndex = Math.min(startIndex + PAGES_ONSCREEN, pages.length);
    nextLastIndex = Math.min(nextIndex + PAGES_ONSCREEN, pages.length);

    // sweep any invalid old pages
    for(index = startIndex, length = lastIndex; index < length; index++) {
      if(index < nextIndex || index >= nextLastIndex)
        pages[index].stash(listView.$shadow);
    }

    listView.startIndex = nextIndex;

    insertPagesInView(listView);
    updateBuffer(listView);
    return nextIndex;
  }


  // ### remove
  //
  // Removes the ListView from the DOM and cleans up after it.

  ListView.prototype.remove = function() {
    this.$el.remove();
    this.cleanup();
  };

  ListView.prototype.setPages = function(pages) {

    // Delete all previous pages
    if (this.pages.length > 0) {
      for (var i = this.pages.length - 1; i >= 0; i--) {
        this.pages[i].remove();
      }
    }

    // Set new pages
    this.pages = pages;

  }


  // ### convertToItem
  //
  // Given an object that is either a ListItem instance, a jQuery element, or a
  // string of valid HTML, makes sure to return either the ListItem itself or
  // a new ListItem that wraps the element.
  //
  // Takes:
  //
  // - `listView`: the ListView instance that wants the item.
  // - `possibleItem`: an object that is either a ListItem, a jQuery element,
  // or a string of valid HTML.

  function convertToItem(listView, possibleItem, prepend) {
    var item;
    if(possibleItem instanceof ListItem) return possibleItem;
    if(typeof possibleItem === 'string') possibleItem = $(possibleItem);
    item = new ListItem(possibleItem);
    cacheCoordsFor(listView, item, prepend);
    return item;
  }


  // ### tooSmall
  //
  // Alerts the given ListView that the given Page is too small. May result
  // in modifications to the `pages` array.

  function tooSmall(listView, page) {
    // Naive solution:
    repartition(listView);
  }


  // ### repartition
  //
  // Repartitions the pages array. This can be used for either defragmenting
  // the array, or recalculating everything on screen resize.

  function repartition(listView) {
    var newPage, index, length, itemIndex, numItems, currItems, currItem,
        nextItem,
        newPages = [],
        filteredItems = listView.filteredItems;

    newPage = new Page(listView);
    newPages.push(newPage);

    for(itemIndex = 0, numItems = filteredItems.length; itemIndex < numItems; itemIndex++) {
      currItem = filteredItems[itemIndex];
      nextItem = currItem.clone();
      if(newPage.hasVacancy()) {
        newPage.append(nextItem);
      } else {
        newPage = new Page(listView);
        newPages.push(newPage);
        newPage.append(nextItem);
      }
    }

    listView.setPages(newPages);
    insertPagesInView(listView);
  }


  // ListView querying
  // -----------------

  // ### find
  //
  // Given a selector string or jQuery element, return the items that hold the
  // given or matching elements.
  //
  // Note: this is slower than an ordinary jQuery find. However, using jQuery
  // to find elements will be bug-prone, since most of the elements won't be in
  // the DOM tree. Caching elements is usually important, but it's even more
  // important to do here.
  //
  // Arguments:
  //
  // - `findObj`: A selector string, or a jQuery element.
  //
  // Returns a ListItem.

  ListView.prototype.find = function(findObj) {
    var items, $onscreen, $offscreen;

    // If given a selector string, find everything matching onscreen and
    // offscreen, and return both.
    if(typeof findObj === 'string') {
      $onscreen = this.$el.find(findObj);
      $offscreen = this.$shadow.find(findObj);
      return this.find($onscreen).concat(this.find($offscreen));
    }

    // Silly option, but might as well.
    if(findObj instanceof ListItem) return [findObj];

    // jQuery element
    items = [];
    findObj.each(function() {
      var pageId, page, pageItems, index, length, currItem,
          $itemEl = $(this).parentsUntil('[' + PAGE_ID_ATTRIBUTE + ']').andSelf().first(),
          $pageEl = $itemEl.parent();


      pageId = $pageEl.attr(PAGE_ID_ATTRIBUTE);
      page = PageRegistry.lookup(pageId);
      if(page) {
        pageItems = page.items;
        for(index = 0, length = pageItems.length; index < length; index++) {
          currItem = pageItems[index];
          if(currItem.$el.is($itemEl)) {
            items.push(currItem);
            break;
          }
        }
      }
    });

    return items;
  };

  // ### startIndexWithinRange
  //
  // Finds the starting index for a listView, given a range. Wraps
  // indexWithinRange.
  //
  // Takes:
  //
  // - `listView`: the ListView whose startIndex you're calculating.
  // - `start`: the start of the range.
  // - `end`: the end of the range.

  function startIndexWithinRange(listView, start, end) {
    var index = indexWithinRange(listView, start, end);
    index = Math.max(index - NUM_BUFFER_PAGES, 0);
    index = Math.min(index, listView.pages.length); // @TODO? https://github.com/airbnb/infinity/pull/33
    return index;
  }


  // ### indexWithinRange
  //
  // Finds the index of the page closest to being within a given range. It's
  // less useful than its wrapper function startIndexWithinRange, and you
  // probably won't need to call this unwrapped version.
  //
  // Takes:
  //
  // - `listView`: the ListView instance whose pages you're looking at.
  // - `start`: the start of the range.
  // - `end`: the end of the range.

  function indexWithinRange(listView, start, end) {
    var index, length, curr, startIndex, midpoint, diff, prevDiff,
        pages = listView.pages,
        rangeMidpoint = start + (end - start)/2;

    // Start looking at the index of the page last contained by the screen --
    // not the first page in the onscreen pages
    startIndex = Math.min(listView.startIndex + NUM_BUFFER_PAGES,
                          pages.length - 1);

    if(pages.length <= 0) return -1;

    curr = pages[startIndex];
    if (listView.landscape) {
      midpoint = curr.begin + curr.width/2;
    } else {
      midpoint = curr.begin + curr.height/2;
    }
    prevDiff = rangeMidpoint - midpoint;
    if(prevDiff < 0) {
      // Search above
      for(index = startIndex - 1; index >= 0; index--) {
        curr = pages[index];
        if (listView.landscape) {
          midpoint = curr.begin + curr.width/2;
        } else {
          midpoint = curr.begin + curr.height/2;
        }
        diff = rangeMidpoint - midpoint;
        if(diff > 0) {
          if(diff < -prevDiff) return index;
          return index + 1;
        }
        prevDiff = diff;
      }
      return 0;
    } else if (prevDiff > 0) {
      // Search below
      for(index = startIndex + 1, length = pages.length; index < length; index++) {
        curr = pages[index];
        if (listView.landscape) {
          midpoint = curr.begin + curr.width/2;
        } else {
          midpoint = curr.begin + curr.height/2;
        }
        diff = rangeMidpoint - midpoint;
        if(diff < 0) {
          if(-diff < prevDiff) return index;
          return index - 1;
        }
        prevDiff = diff;
      }
      return pages.length - 1;
    }

    // Perfect hit! Return it.
    return startIndex;
  }


  // ListView cleanup
  // ----------------

  ListView.prototype.cleanup = function() {
    var pages = this.pages,
        page;
    DOMEvent.detach(this);
    while(page = pages.pop()) {
      page.cleanup();
    }
  };


  // ListView event binding
  // ----------------------
  //
  // Internal scroll and resize  binding and throttling. Allows ListViews to
  // bind to a throttled scroll event (and debounced resize event), and updates
  // them as it fires.

  var DOMEvent = (function() {
    var eventIsBound = false,
        resizeTimeout = null,
        boundViews = [];


    // ### scrollHandler
    //
    // Callback called on scroll. Schedules a `scrollAll` callback if needed,
    // and disallows future scheduling.

    function scrollHandler() {
      if(!this.scrollScheduled) {
        setTimeout(scrollAll.bind(this), config.SCROLL_THROTTLE);
        this.scrollScheduled = true;
      }
    }


    // ### scrollAll
    //
    // Callback passed to the setTimeout throttle. Calls `scrollListView` on
    // every bound ListView, and then allows new scroll events to be
    // scheduled.

    function scrollAll() {

      var index, length,
          $this = $(this),
          boundViews = $this.data('infinity-boundviews');

      // Update the pages in view
      for(index = 0, length = boundViews.length; index < length; index++) {
        updateStartIndex(boundViews[index]);
      }

      // Calc current scroll positions
      if (boundViews[0].landscape) {
        var currentScrollPositionBegin = $this.scrollLeft(),
            currentScrollPositionEnd =  currentScrollPositionBegin + $this.width(),
            targetScrollPositionStart = 0 + 250,
            targetScrollPositionEnd = ($.isWindow($this.get(0)) ? document.body.scrollWidth : this.scrollWidth) - 250;
      } else {
        var currentScrollPositionBegin = $this.scrollTop(),
            currentScrollPositionEnd =  currentScrollPositionBegin + $this.height(),
            targetScrollPositionStart = 0 + 250,
            targetScrollPositionEnd = ($.isWindow($this.get(0)) ? document.body.scrollHeight : this.scrollHeight) - 250;
      }

      // Check for beginReached
      if (currentScrollPositionBegin <= targetScrollPositionStart) {
        $this.trigger('infinity.beginReached');
      }

      // Check for endReached
      if (targetScrollPositionEnd <= currentScrollPositionEnd) {
        $this.trigger('infinity.endReached');
      }

      this.scrollScheduled = false;

    }


    // ### resizeHandler
    //
    // Callback called on resize. Debounces a `resizeAll` callback.

    function resizeHandler() {
      if(resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resizeAll, 200);
    }


    // ### resizeAll
    //
    // Handles resizing all ListViews. Just calls `repartition` on them for
    // now.

    function resizeAll() {
      var index, curr;
      for(index = 0; curr = boundViews[index]; index++) {
        repartition(curr);
      }
    }

    return {

      // ### attach
      //
      // Binds a given ListView to a throttled scroll event. Does not create
      // multiple event handlers if called by multiple ListViews.
      //
      // Takes:
      //
      // - `listView`: a ListView that is not currently bound to the scroll
      //   event.

      attach: function(listView) {

        // Set up scroll events on $scrollParent
        if(!listView.$scrollParent.data('infinity-eventbound')) {

          // Regular scroll: recalc which pages to show
          listView.$scrollParent.on('scroll.infinity', scrollHandler);

          // Mousewheel scroll: scroll horizontally when scrolling vertically
          if (listView.landscape && config.SCROLL_HORIZONTAL_HIJACK) {

            // When window is the scrollParent, listen for events on the body
            var $elToHijackScrollOn = $.isWindow(listView.$scrollParent.get(0)) ? $('body') : listView.$scrollParent;

            $elToHijackScrollOn.on('mousewheel DOMMouseScroll', function(e) {
              var delta = e.originalEvent.detail || e.originalEvent.wheelDelta;
              this.scrollLeft -= delta;
              e.preventDefault();
            });

          }

          // Keep track of some things
          listView.$scrollParent.data('infinity-eventbound', true);
          listView.$scrollParent.data('infinity-boundviews', []);

        }

        // Recalculate some stuff on resize
        if(!eventIsBound) {
          $window.on('resize.infinity', resizeHandler);
          eventIsBound = true;
        }

        // Keep track of the views (both globally, as on the scrollparent)
        boundViews.push(listView);
        listView.$scrollParent.data('infinity-boundviews').push(listView);

      },


      // ### detach
      //
      // Detaches a bound ListView from the throttled scroll event. If no
      // ListViews remain bound to the throttled scroll, unbinds the scroll
      // handler from the window's scroll event.
      //
      // Returns true if the listView was successfully detached, and false
      // otherwise.
      //
      // Takes:
      //
      // - `listView`: a ListView that is currently bound to the scroll event.

      detach: function(listView) {
        var index, length;
        if(listView.$scrollParent.data('infinity-eventbound')) {
          listView.$scrollParent.off('scroll.infinity');
          listView.$scrollParent.data('infinity-eventbound', false);
        }

        for(index = 0, length = boundViews.length; index < length; index++) {
          if(boundViews[index] === listView) {
            boundViews.splice(index, 1);
            if(boundViews.length === 0) {
              $window.off('resize.infinity');
              eventIsBound = false;
            }
            return true;
          }
        }
        return false;
      }
    };
  }());


  // Page class
  // ==========
  //
  // An internal class used for ordering items into roughly screen-sized pages.
  // Pages are removed and added to the DOM wholesale as they come in and out
  // of view.

  function Page(parent) {
    this.parent = parent;

    this.items = [];
    this.$el = blankDiv();

    this.id = PageRegistry.generatePageId(this);
    this.$el.attr(PAGE_ID_ATTRIBUTE, this.id);

    this.begin = 0;
    this.end = 0;
    this.width = 0;
    this.height = 0;

    this.lazyloaded = false;

    this.onscreen = false;
  }


  // ### append
  //
  // Appends a ListItem to the Page.
  //
  // Takes:
  //
  // - `item`: a ListItem.

  Page.prototype.append = function(item) {
    var items = this.items;

    // Recompute coords, sizing.
    if(items.length === 0) this.begin = item.begin;
    this.end = item.end;
    if (this.parent.landscape) {
      this.height = this.height > item.height ? this.height : item.height;
      this.width = this.end - this.begin;
    } else {
      this.width = this.width > item.width ? this.width : item.width;
      this.height = this.end - this.begin;
    }

    items.push(item);
    item.parent = this;
    this.$el.append(item.$el);

    this.lazyloaded = false;
  };


  // ### prepend
  //
  // Prepends a ListItem to the Page.
  //
  // Takes:
  //
  // - `item`: a ListItem.

  Page.prototype.prepend = function(item) {
    var items = this.items;

    // Recompute coords, sizing.
    if (this.parent.landscape) {
      this.end += item.width;
      this.height = this.height > item.height ? this.height : item.height;
      this.width = this.end - this.begin;
    } else {
      this.end += item.height;
      this.width = this.width > item.width ? this.width : item.width;
      this.height = this.end - this.begin;
    }

    items.splice(0,0,item);
    item.parent = this;
    this.$el.prepend(item.$el);

    this.lazyloaded = false;
  };


  // ### hasVacancy
  //
  // Returns false if the Page is at max capacity; false otherwise.

  Page.prototype.hasVacancy = function() {
    var viewRef = this.parent.$scrollParent;
    if (this.parent.landscape) {
      return this.width < viewRef.width() * config.PAGE_TO_SCREEN_RATIO;
    } else {
      return this.height < viewRef.height() * config.PAGE_TO_SCREEN_RATIO;
    }
  };


  // ### appendTo
  //
  // Proxies to jQuery to append the Page to the given jQuery element.

  Page.prototype.appendTo = function($el) {
    if(!this.onscreen) {
      this.$el.appendTo($el);
      this.onscreen = true;
    }
  };


  // ### prependTo
  //
  // Proxies to jQuery to prepend the Page to the given jQuery element.

  Page.prototype.prependTo = function($el) {
    if(!this.onscreen) {
      this.$el.prependTo($el);
      this.onscreen = true;
    }
  };

  // ### stash
  //
  // Temporarily stash the onscreen page under a different element.

  Page.prototype.stash = function($el) {
    if(this.onscreen) {
      this.$el.appendTo($el);
      this.onscreen = false;
    }
  };


  // ### remove
  //
  // Removes the Page from the DOM and cleans up after it.

  Page.prototype.remove = function() {
    if(this.onscreen) {
      this.$el.detach();
      this.onscreen = false;
    }
    this.cleanup();
  };


  // ### cleanup
  //
  // Cleans up the Page without removing it.

  Page.prototype.cleanup = function() {
    var items = this.items,
        item;

    this.parent = null;
    PageRegistry.remove(this);
    while (item = items.pop()) {
      item.cleanup();
    }
  };


  // ### lazyload
  //
  // Runs the given lazy-loading callback on all unloaded page content.
  //
  // Takes:
  //
  // - `callback`: a function of the form `function([$el]){}`. Will run on
  // each unloaded element, and will use the element as its calling context.

  Page.prototype.lazyload = function(callback) {
    var $el = this.$el,
        index, length;
    if (!this.lazyloaded) {
      for (index = 0, length = $el.length; index < length; index++) {
        callback.call($el[index], $el[index]);
      }
      this.lazyloaded = true;
    }
  };


  // Page Registry
  // ------------

  var PageRegistry = (function() {
    var pages = [];
    return {
      generatePageId: function(page) {
        return pages.push(page) - 1;
      },
      lookup: function(id) {
        return pages[id] || null;
      },
      remove: function(page) {
        var id = page.id;
        if(!pages[id]) return false;
        pages[id] = null;
        return true;
      }
    };
  }());


  // ### removeItemFromPage
  //
  // Removes a given ListItem from the given Page.

  function removeItemFromPage(item, page) {
    var index, length, foundIndex,
        items = page.items;
    for(index = 0, length = items.length; index < length; index++) {
      if(items[index] === item) {
        foundIndex = index;
        break;
      }
    }

    if(foundIndex == null) return false;

    items.splice(foundIndex, 1);
    if (page.parent.landscape) {
      page.end -= item.width;
      page.width = page.end - page.begin;
    } else {
      page.end -= item.height;
      page.height = page.end - page.begin;
    }
    if(page.hasVacancy()) tooSmall(page.parent, page);

    return true;
  }


  // ListItem class
  // ==============
  //
  // An individual item in the ListView.
  //
  // Has cached start, end, width, and height properties, determined from
  // jQuery. This positioning data will be determined when the ListItem is
  // inserted into a ListView; it can't be determined ahead of time.
  //
  // All positioning data is relative to the containing ListView.

  function ListItem($el) {
    this.$el = $el;

    this.parent = null;

    this.begin = 0;
    this.end = 0;
    this.width = 0;
    this.height = 0;
  }


  // ### clone
  //
  // Clones the ListItem.
  ListItem.prototype.clone = function() {
    var item = new ListItem(this.$el);
    item.begin = this.begin;
    item.end = this.end;
    item.width = this.width;
    item.height = this.height;
    return item;
  };

  // ### remove
  //
  // Removes the ListItem and its elements from the page, and cleans up after
  // them.

  ListItem.prototype.remove = function() {
    this.$el.remove();
    removeItemFromPage(this, this.parent);
    // @TODO: Also delete it from the listView
    this.cleanup();
  };


  // ### cleanup
  //
  // Cleans up after the ListItem without removing it from the page.

  ListItem.prototype.cleanup = function() {
    this.parent = null;
  };



  // Helper functions
  // ================


  // ### blankDiv
  //
  // Returns a new, empty `<div>` jQuery element. The `<div>` will have its
  // border, margin, and padding set to zero or none, as appropriate.

  function blankDiv() {
    return $('<div>').css({
      margin: 0,
      padding: 0,
      border: 'none'
    });
  }


  // ### pxToInt
  //
  // Converts pixel values returned by jQuery to base-10 ints.
  //
  // Takes:
  //
  // - `px`: a string value, which starts with a number and is
  //   postfixed with the string `'px'`.

  //function pxToInt(px) {
  //  return parseInt(px, 10);
  //}


  // Export
  // ======

  // Classes:
  infinity.ListView = ListView;
  infinity.Page = Page;
  infinity.ListItem = ListItem;

  //jQuery plugin
  function registerPlugin(infinity) {
    var ListView;
    if(infinity) {
      ListView = infinity.ListView;

      $.fn.listView = function (options) {
        return new ListView(this, options);
      };
    }
    else {
      delete $.fn.listView;
    }
  }

  registerPlugin(infinity);

  // Destroy own packaging:
  infinity.noConflict = function() {
    window.infinity = oldInfinity;
    registerPlugin(oldInfinity);
    return infinity;
  };

}(window, Math, jQuery);
