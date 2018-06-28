function PeliasGeocoder(opts) {
  opts = opts || {};
  this.opts = {};
  this.opts.placeholder = opts.placeholder || 'Search';
  this.opts.url = opts.url;
  this.opts.flyTo = opts.flyTo === undefined ? true : opts.flyTo;
  this.opts.sources = opts.sources;
  this.opts.useFocusPoint = opts.useFocusPoint;
  this.opts.removeDuplicates = opts.removeDuplicates === undefined ? true : opts.removeDuplicates;
  this.opts.onSubmitOnly = opts.onSubmitOnly;
  if (opts.marker) {
    this.opts.marker = {};
    this.opts.marker.icon = opts.marker.icon || 'marker-15';
    this.opts.marker.anchor = opts.marker.anchor || 'bottom';
  }
  if (opts.params) {
    this.params = '';
    for (var i in opts.params) {
      this.params += '&' + i + '=' + opts.params[i];
    }
  }
  this.layerId = 'pelias-mapbox-gl-js';
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
    // keyCodes: 13 => Enter
    if (e.keyCode !== 13 && (!value || value.trim().length === 0 || self._text == value.trim() || self.opts.onSubmitOnly)) {
      if (!value) {
        self._resultsEl.removeAll();
        self._removeMarkers();
      }
      return;
    }

    value = value.trim();
    self._text = value;
    if (this._timeoutId !== undefined) {
      clearTimeout(this._timeoutId);
    }
    this._timeoutId = setTimeout(function() {
        self.search({text: value}, function(err, result) {
          if (err) {
            return self._showError(err);
          }
          if (result && value == self._text) {
            return self._showResults(result)
          }
        });
    }, (self.opts.onSubmitOnly || e.keyCode === 13) ? 0 : 350);
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
    + (self.opts.sources ? ('&sources=' + self.opts.sources) : '')
    + (self.opts.useFocusPoint ? ('&focus.point.lat=' + map.getCenter().lat + '&focus.point.lon=' + map.getCenter().lng) : '');
  var req = new XMLHttpRequest();
  req.addEventListener('load', function() {
    switch (this.status) {
      case 200:
        return callback(null, JSON.parse(this.responseText));
      case 400:
        return callback('You sent a bad request.');
      case 401:
        return callback('You are not authorized to use this geocode.');
      case 500:
        return callback('This server can not answer yet.');
    }
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
  var features = self._removeDuplicates(results.features);
  features.forEach(function(e) {
    var el = document.createElement('div');
    el.innerHTML = e.properties.label;
    el.className = ''
    el.feature = e;
    el.onmousedown = function() {
      return false;
    }
    el.onmouseup = function() {
      self._resultsEl.removeAll();
      self._text = self._inputEl.value = e.properties.label;
      var cameraOpts = {
        center: e.geometry.coordinates,
        zoom: self._getBestZoom(e)
      };
      if (self._useFlyTo(cameraOpts)) {
        self._map.flyTo(cameraOpts);
      } else {
        self._map.jumpTo(cameraOpts);
      }
      return false;
    }
    self._resultsEl.appendChild(el);
    self._updateMarkers(features);
  })
};

PeliasGeocoder.prototype._useFlyTo = function(cameraOpts) {
  if (this.opts.flyTo == 'hybrid') {
    return this._areNear(cameraOpts.center, this._latlngToArray(this._map.getCenter()), this._getFlyToToleranceByZoom(this._map.getZoom()));
  }
  return this.opts.flyTo;
};

PeliasGeocoder.prototype._getFlyToToleranceByZoom = function(zoom) {
  return zoom < 3 ? 360 : 160 / Math.pow(zoom + 1, 2);
}

PeliasGeocoder.prototype._removeDuplicates = function(features) {
  var results = [];
  var groupBy = {};
  var self = this;
  if (!self.opts.removeDuplicates) {
    return features;
  }
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
        if(!groupBy[label][j].remove && self._areNear(e.geometry.coordinates, groupBy[label][j].geometry.coordinates, 0.2)) {
          groupBy[label][j].remove = true;
        }
      }
    });
  }
  return features.filter(function(e, i) {
    return !e.remove;;
  })
}

PeliasGeocoder.prototype._showError = function(err) {
  var self = this;
  var el = document.createElement('div');
  el.innerHTML = err;

  self._resultsEl.removeAll();
  self._resultsEl.appendChild(el);
}

PeliasGeocoder.prototype._areNear = function(c1, c2, tolerance) {
  return this._between(c1[0], c2[0] - tolerance, c2[0] + tolerance) && this._between(c1[1], c2[1] - tolerance, c2[1] + tolerance);
}

PeliasGeocoder.prototype._latlngToArray = function(center) {
  return [center.lng, center.lat];
}

PeliasGeocoder.prototype._between = function(x, min, max) {
  return x >= min && x <= max;
}

PeliasGeocoder.prototype._getBestZoom = function(e) {
  var bbox = e.bbox;
  if (!bbox) {
    return (['address', 'venue', 'street'].indexOf(e.properties.layer) > -1) ? 18 : 14;
  }
  return 8.5 - Math.log10(Math.abs(bbox[2] - bbox[0]) * Math.abs(bbox[3] - bbox[1]));
}

PeliasGeocoder.prototype._removeMarkers = function() {
  if (!this.opts.marker) {
    return;
  }
  if (this._map.getSource(this.layerId)) {
    this._map.removeLayer(this.layerId);
    this._map.removeSource(this.layerId);
  }
}

PeliasGeocoder.prototype._updateMarkers = function(features) {
  if (!this.opts.marker) {
    return;
  }
  if (this._map.getSource(this.layerId)) {
    this._map.removeLayer(this.layerId);
    this._map.removeSource(this.layerId);
  }
  this._map.addLayer({
    "id": this.layerId,
    "type": "symbol",
    "source": {
        "type": "geojson",
        "data": {
          "type": "FeatureCollection",
          "features": features
        }
    },
    "layout": {
        "icon-allow-overlap": true,
        "icon-image": this.opts.marker.icon,
        "text-anchor": this.opts.marker.anchor
    }
  })
};