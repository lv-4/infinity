jQuery(function() {

	// Infinity Configuration
	infinity.config.PAGE_TO_SCREEN_RATIO = 1;
	infinity.config.SCROLL_THROTTLE = 100;

	// Array which will hold dummy items to append when the bottom is reached. This list will be built based upon the data already present in the HTML
	var dummyItems = $('.infinity-item');

	// Variable to indicate if we are loading extra data. This way we prevent double loads
	var isLoading = false;

	// Logic to load in more data
	var loadMoreData = function($scrollParent, where, numItems) {

		console.log('moredata.loading');

		// Mark as loading
		isLoading = true;

		// Default numItems to 20
		if (!numItems) numItems = 20;

		// In a normal scenario you would query an API of some sorts for more data. Here we totally fake it.
		setTimeout(function() {

			console.log('moredata.loaded');

			// Get 20 random items
			// @ref https://css-tricks.com/snippets/javascript/shuffle-array/
			var randomItems = dummyItems.sort(function() { return 0.5 - Math.random() }).slice(0, numItems);

			// Get the columns inside the $scrollParent
			var $columns = $scrollParent.find('.infinity-wrapper');

			// Add all items to the shortest column at that moment
			$(randomItems).each(function() {
				$item = $(this);

				// Define shortest column
				$shortestColumn = null;
				$columns.each(function() {

					// Get reference to column
					$column = $(this);

					// Landscape: use the width to determine the shortest column
					if ($column.data('listView').landscape) {
						if (!$shortestColumn || ($column.width() < $shortestColumn.width())) {
							$shortestColumn = $column;
						}
					}

					// Vertical: use the height to determine the shortest column
					else {
						if (!$shortestColumn || ($column.height() < $shortestColumn.height())) {
							$shortestColumn = $column;
						}
					}

				});

				// Append/Prepend the item to the shortest column
				if (where == 'append') {
					$shortestColumn.data('listView').append($item.clone());
				} else {
					$shortestColumn.data('listView').prepend($item.clone());
				}

			});

			// Unmark as loading
			isLoading = false;

		}, 1500);
	}

	// Apply Infinity on all columns
	$('.demo').each(function() {

		var $scrollParent = $(this);

		$scrollParent.find('.infinity-wrapper').each(function() {

			// If we're not scrolling inside an overflowing element we need to listen for scroll events on $(window), not the element itself.
			$actualScrollParent = $scrollParent.hasClass('demo--overflow') ? $scrollParent : $(window);

			// Get reference to the column
			var $column = $(this);

			// Initialize Infinity
			var listView = new infinity.ListView($column, {
				landscape: $scrollParent.hasClass('horizontal'),
				scrollParent: $actualScrollParent,
				itemSelector: '.infinity-item',
				lazy: function() {
					$(this).find('img').each(function() {
						var $img = $(this);
						$img.attr('src', $img.attr('data-original'));
					});
				}
			});

			// Store the created listView for future reference
			$column.data('listView', listView);

		});

		// $actualScrollParent.on('infinity.beginReached', function() {
		// 	if (isLoading) return;
		// 	loadMoreData($scrollParent, 'prepend');
		// });

		$actualScrollParent.on('infinity.endReached', function() {
			if (isLoading) return;
			loadMoreData($scrollParent, 'append');
		});

	});

});