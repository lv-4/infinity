```
 __     __   __     ______   __     __   __     __     ______   __  __    
/\ \   /\ "-.\ \   /\  ___\ /\ \   /\ "-.\ \   /\ \   /\__  _\ /\ \_\ \   
\ \ \  \ \ \-.  \  \ \  __\ \ \ \  \ \ \-.  \  \ \ \  \/_/\ \/ \ \____ \  
 \ \_\  \ \_\\"\_\  \ \_\    \ \_\  \ \_\\"\_\  \ \_\    \ \_\  \/\_____\ 
  \/_/   \/_/ \/_/   \/_/     \/_/   \/_/ \/_/   \/_/     \/_/   \/_____/ 
```

Infinity.js is a UITableView for the web: it speeds up scrolling through long
lists and keeps your infinite feeds smooth and stable for your users.

The original work on Infinity.js was done by the folks over at Airbnb ([repo](https://github.com/airbnb/infinity))

This is a modified version which:
- Allows prerendered content/elements to be contained in the list
- Triggers `beginReached` and `endReached` events when scrolling a list
- Supports horizontal scrolling
- Works on elements that overflow (not just `<body>`)
- Supports filtering
- ...

Additionally a few demos to get you started more easily are provided.

For more information:
[http://airbnb.io/infinity/](http://airbnb.io/infinity/)
