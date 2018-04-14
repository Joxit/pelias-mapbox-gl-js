function PeliasGeocoder(opts) {
  opts = opts || {};
  this.opts = {};
  this.opts.placeholder = opts.placeholder || 'Search';
  this.opts.url = opts.url;
  if (opts.params) {
    this.params = '';
    for (var i in opts.params) {
      this.params += '&' + i + '=' + opts.params[i];
    }
  }
}

PeliasGeocoder.prototype.onAdd = function(map) {
  var self = this;
  this._map = map;

  var el = this.container = document.createElement('div');
  el.className = 'pelias-ctrl-geocoder mapboxgl-ctrl';

  var icon = document.createElement('span');
  icon.className = 'geocoder-icon geocoder-icon-search';

  this._inputEl = document.createElement('input');
  this._inputEl.type = 'text';
  this._inputEl.placeholder = this.opts.placeholder;

  this._inputEl.addEventListener('keyup', function(e) {
    var value = self._inputEl.value;
    if (e.keyCode !== 13 && (!value || value.trim().length === 0 || self._text == value.trim())) {
      return;
    }
    value = value.trim();
    self._text = value;
    if (this._timeoutId !== undefined) {
      clearTimeout(this._timeoutId);
    }
    this._timeoutId = setTimeout(function() {
        self.search({text: value}, function(result) {
          self._showResults(result)
        });
    }, 250);
  });

  this._resultsEl = document.createElement('div');
  this._resultsEl.className = 'pelias-geocode-results'
  this._resultsEl.removeAll = function () {
    while (this.firstChild) {
      this.removeChild(this.firstChild);
    }
  }
  el.appendChild(icon);
  el.appendChild(this._inputEl);
  el.appendChild(this._resultsEl);
  return el;
}

PeliasGeocoder.prototype.search = function(opts, callback) {
  var self = this;
  opts = opts || {};
  if (!opts.text || opts.text.length == 0) {
    return callback();
  }
  if (self.opts.sources instanceof Array) {
    self.opts.sources = self.opts.sources.join(',');
  }
  var url = self.opts.url + '/search?text=' + opts.text
    + (self.params ? this.params : '')
    + (self.opts.sources ? ('&sources=' + self.opts.sources) : '');
  var req = new XMLHttpRequest();
  req.addEventListener('load', function() {
    callback(JSON.parse(this.responseText))
  })
  req.open('GET', url);
  req.send();
}

PeliasGeocoder.prototype.getDefaultPosition = function() {
  return 'top-left'
}

PeliasGeocoder.prototype._showResults = function(results) {
  var self = this;
  self._resultsEl.removeAll();
  self._removeDuplicates(results.features).forEach(function(e) {
    var el = document.createElement('div');
    el.innerHTML = e.properties.label;
    el.className = ''
    el.feature = e;
    el.onclick = function() {
      self._resultsEl.removeAll();
      self._text = self._inputEl.value = e.properties.label;
      self._map.flyTo({
        center: e.geometry.coordinates,
        zoom: self._getBestZoom(e)
      });
    }
    self._resultsEl.appendChild(el);
  })
}

PeliasGeocoder.prototype._removeDuplicates = function(features) {
  var results = [];
  var groupBy = {};
  var self = this;
  features.forEach(function(e) {
    var label = e.properties.label;
    if (!groupBy[label]) {
      groupBy[label] = []
    }
    groupBy[label].push(e);
  });
  for (var label in groupBy) {
    groupBy[label].forEach(function(e, i) {
      var j;
      if (e.remove || groupBy[label].length == 1) {
        return;
      }
      for (j = i + 1; j < groupBy[label].length; j++) {
        if(!groupBy[label][j].remove && self._areNear(e.geometry.coordinates, groupBy[label][j].geometry.coordinates)) {
          groupBy[label][j].remove = true;
        }
      }
    });
  }
  return features.filter(function(e, i) {
    return !e.remove;;
  })
}

PeliasGeocoder.prototype._areNear = function(c1, c2) {
  return this._between(c1[0], c2[0] - 0.2, c2[0] + 0.2) && this._between(c1[1], c2[1] - 0.2, c2[1] + 0.2);
}

PeliasGeocoder.prototype._between = function(x, min, max) {
  return x >= min && x <= max;
}

PeliasGeocoder.prototype._getBestZoom = function(e) {
  var bbox = e.bbox;
  if (!bbox) {
    return e.properties.street ? 18 : 14;
  }
  return 8.5 - Math.log10(Math.abs(bbox[2] - bbox[0]) * Math.abs(bbox[3] - bbox[1]));
}