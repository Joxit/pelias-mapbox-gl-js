// ---------------------------------------------
// ---------- Plugin/Mapbox GL JS API ----------
// ---------------------------------------------

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
    this.opts.marker.multiple = opts.marker.multiple !== undefined ? opts.marker.multiple : true;
    this._customHtmlMarkers = [];
  }

  if (opts.wof) {
    this.opts.wof = {};
    this.opts.wof.url = opts.wof.url || 'https://raw.githubusercontent.com/whosonfirst-data/whosonfirst-data/master/data/';
    this.opts.wof.fillColor = opts.wof.fillColor || "rgba(200, 40, 32, 0.1)";
    this.opts.wof.fillOutlineColor = opts.wof.fillOutlineColor || "rgba(200, 40, 32, 0.7)";
    this.getWOFURL = opts.wof.getWOFURL || this.getDefaultWOFURLFunction();
  }

  if (opts.params) {
    this.params = '';
    for (var key in opts.params) {
      if (opts.params.hasOwnProperty(key)) {
        this.params += '&' + key + '=' + opts.params[key];
      }
    }
  }

  this.markerLayerId = 'pelias-mapbox-gl-js-marker';
  this.polygonLayerId = 'pelias-mapbox-gl-js-polygon';
  this._removePolygon = this._removeSources.bind(this, this.opts.wof, this.polygonLayerId);

  this._keyCodes = {};
  this._keyCodes.enter = 13;
  this._keyCodes.arrowUp = 38;
  this._keyCodes.arrowDown = 40;
}

PeliasGeocoder.prototype.onAdd = function (map) {
  this._map = map;
  const wrapperEl = this._createElement({class: 'pelias-ctrl mapboxgl-ctrl'});
  const inputWrapperEl = this._createElement({class: 'input-wrapper'});
  const inputActionsWrapperEl = this._createElement({class: 'input-actions-wrapper'});

  this._iconSearchEl = this._buildIconSearchHTMLElement();
  this._inputEl = this._buildInputHTMLElement();
  this._resultsEl = this._buildResultsHTMLElement();

  inputActionsWrapperEl.appendChild(this._iconSearchEl);
  inputWrapperEl.appendChild(this._inputEl);
  inputWrapperEl.appendChild(inputActionsWrapperEl);
  wrapperEl.appendChild(inputWrapperEl);
  wrapperEl.appendChild(this._resultsEl);

  return wrapperEl;
};

PeliasGeocoder.prototype.getDefaultPosition = function () {
  return 'top-left'
};

// ----------------------------
// ---------- search ----------
// ----------------------------

PeliasGeocoder.prototype.search = function (opts, callback) {
  opts = opts || {};
  if (!opts.text || opts.text.length === 0) {
    return callback();
  }
  if (this.opts.sources instanceof Array) {
    this.opts.sources = this.opts.sources.join(',');
  }
  var url = this.opts.url + '/search?text=' + opts.text
    + (this.params ? this.params : '')
    + (this.opts.sources ? ('&sources=' + this.opts.sources) : '')
    + (this.opts.useFocusPoint ? ('&focus.point.lat=' + this._map.getCenter().lat + '&focus.point.lon=' + this._map.getCenter().lng) : '');
  this._sendXmlHttpRequest(url, callback);
};

PeliasGeocoder.prototype._showResults = function (results) {
  const self = this;
  const features = this._removeDuplicates(results.features);

  this._resultsEl.removeAll();
  this._disableOrNotIcon(this._iconSearchEl, features.length === 0);

  features.forEach(function (feature, index) {
    self._resultsEl.appendChild(self._buildAndGetResult(feature, index));
    if (self.opts.marker.multiple) {
      self._updateMarkers(features);
    }
  })
};

PeliasGeocoder.prototype._removeDuplicates = function (features) {
  const self = this;
  const groupBy = {};
  if (!this.opts.removeDuplicates) {
    return features;
  }

  features.forEach(function (feature) {
    const label = feature.properties.label;
    if (!groupBy[label]) {
      groupBy[label] = []
    }
    groupBy[label].push(feature);
  });
  for (var label in groupBy) {
    if (groupBy.hasOwnProperty(label)) {
      groupBy[label].forEach(function (feature, index) {
        if (feature.remove || groupBy[label].length === 1) {
          return;
        }
        for (var j = index + 1; j < groupBy[label].length; j++) {
          if (!groupBy[label][j].remove && self._areNear(feature.geometry.coordinates, groupBy[label][j].geometry.coordinates, 0.2)) {
            groupBy[label][j].remove = true;
          }
        }
      });
    }
  }
  return features.filter(function (feature) {
    return !feature.remove;
  })
};

PeliasGeocoder.prototype._showError = function (error) {
  const errorEl = document.createElement('div');
  errorEl.innerHTML = error;
  this._resultsEl.removeAll();
  this._resultsEl.appendChild(errorEl);
};

PeliasGeocoder.prototype._goToFeatureLocation = function (feature) {
  this._results = undefined;
  this._disableOrNotIcon(this._iconSearchEl, true);
  this._resultsEl.removeAll();
  this._text = this._inputEl.value = feature.properties.label;
  const cameraOpts = {
    center: feature.geometry.coordinates,
    zoom: this._getBestZoom(feature)
  };
  if (this._useFlyTo(cameraOpts)) {
    this._map.flyTo(cameraOpts);
  } else {
    this._map.jumpTo(cameraOpts);
  }
  if (feature.properties.source === 'whosonfirst' && ['macroregion', 'region', 'macrocounty', 'county', 'locality', 'localadmin', 'borough', 'macrohood', 'neighbourhood', 'postalcode'].indexOf(feature.properties.layer) >= 0) {
    this._showPolygon(feature.properties.id, cameraOpts.zoom);
  } else {
    this._removePolygon();
  }
};

// -----------------------------
// ---------- polygon ----------
// -----------------------------

PeliasGeocoder.prototype._showPolygon = function (id, bestZoom) {
  if (!this.opts.wof) {
    return;
  }
  this._removePolygon();
  this._map.addLayer({
    id: this.polygonLayerId,
    type: "fill",
    source: {
      type: "geojson",
      data: this.getWOFURL(id)
    },
    paint: {
      "fill-color": this.opts.wof.fillColor,
      "fill-outline-color": this.opts.wof.fillOutlineColor,
      "fill-opacity": {
        stops: [[bestZoom + 3, 1], [bestZoom + 4, 0]]
      }
    }
  })
};

PeliasGeocoder.prototype.getDefaultWOFURLFunction = function () {
  const self = this;
  return function (id) {
    var strId = id.toString();
    var parts = [];
    while (strId.length) {
      var part = strId.substr(0, 3);
      parts.push(part);
      strId = strId.substr(3);
    }
    return self.opts.wof.url + parts.join('/') + '/' + id + '.geojson';
  }
};

// ----------------------------
// ---------- marker ----------
// ----------------------------

PeliasGeocoder.prototype._updateMarkers = function (features) {
  if (!this.opts.marker) {
    return;
  }
  this._removeMarkers();
  if (!Array.isArray(features)) {
    features = [features];
  }
  if (this.opts.marker.icon instanceof HTMLElement) {
    for (var i = 0; i < features.length; ++i) {
      this._customHtmlMarkers.push(this._addAndGetCustomHtmlMarker(features[i].geometry.coordinates));
    }
  } else {
    this._map.addLayer({
      id: this.markerLayerId,
      type: "symbol",
      source: {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: features
        }
      },
      layout: {
        "icon-allow-overlap": true,
        "icon-image": this.opts.marker.icon,
        "icon-anchor": this.opts.marker.anchor
      }
    })
  }
};

PeliasGeocoder.prototype._addAndGetCustomHtmlMarker = function (coordinates) {
  return new mapboxgl.Marker(this.opts.marker.icon.cloneNode(true))
    .setLngLat(coordinates)
    .addTo(this._map)
};

PeliasGeocoder.prototype._removeMarkers = function () {
  if (!this.opts.marker) {
    return;
  }
  if (this.opts.marker.icon instanceof HTMLElement) {
    for (var i = 0; i < this._customHtmlMarkers.length; ++i) {
      this._customHtmlMarkers[i].remove();
    }
    this._customHtmlMarkers = [];
  } else {
    this._removeSources(this.opts.marker, this.markerLayerId)
  }
};

// --------------------------
// ---------- HTML ----------
// --------------------------

PeliasGeocoder.prototype._createElement = function(opts) {
  const element = document.createElement(opts.type || 'div');
  opts.class !== undefined && (element.className = opts.class);
  opts.html !== undefined && (element.innerHTML = opts.html);
  return element;
};

PeliasGeocoder.prototype._buildIconSearchHTMLElement = function () {
  const self = this;
  const iconSearchEl = this._createElement({type: 'span', class: 'action-icon action-icon-search disabled'});

  iconSearchEl.addEventListener('click', function () {
    if (self._results && self._results.features[0]) {
      const feature = self._results.features[0];
      self._goToFeatureLocation(feature);
      self._updateMarkers(feature);
    }
  });
  return iconSearchEl;
};

PeliasGeocoder.prototype._buildInputHTMLElement = function () {
  const self = this;
  const inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.placeholder = this.opts.placeholder;

  inputEl.addEventListener('keydown', function (e) {
    if (self._results && self._results.features[0]) {
      if (e.keyCode === self._keyCodes.enter) {
        inputEl.blur();
        const feature = self._results.features[0];
        self._goToFeatureLocation(feature);
        self._updateMarkers(feature);
      }
      if (e.keyCode === self._keyCodes.arrowDown) {
        self._resultsEl.firstChild.focus();
      }
    }
  });

  inputEl.addEventListener('keyup', function (e) {
    var value = inputEl.value;
    if (e.keyCode !== self._keyCodes.enter && (!value || value.trim().length === 0 || self._text === value.trim() || self.opts.onSubmitOnly)) {
      if (!value) {
        self._disableOrNotIcon(self._iconSearchEl, true);
        self._resultsEl.removeAll();
        self._removeMarkers();
        self._removePolygon();
      }
      return;
    }
    value = value.trim();
    self._text = value;
    if (this._timeoutId !== undefined) {
      clearTimeout(this._timeoutId);
    }
    this._timeoutId = setTimeout(function () {
      self.search({text: value}, function (err, result) {
        if (err) {
          return self._showError(err);
        }
        if (result && value === self._text) {
          self._results = result;
          return self._showResults(result)
        }
      });
    }, (self.opts.onSubmitOnly || e.keyCode === self._keyCodes.enter) ? 0 : 350);
  });
  return inputEl;
};

PeliasGeocoder.prototype._buildResultsHTMLElement = function () {
  const resultsEl = this._createElement({class: 'results'});
  resultsEl.removeAll = function () {
    while (this.firstChild) {
      this.removeChild(this.firstChild);
    }
  };
  return resultsEl;
};

PeliasGeocoder.prototype._buildAndGetResult = function (feature, index) {
  const self = this;
  const resultEl = this._createElement({html: feature.properties.label, class: 'result'});
  resultEl.feature = feature;
  resultEl.setAttribute("tabindex", "-1");

  resultEl.onclick = function () {
    self._goToFeatureLocation(feature);
    self._updateMarkers(feature);
  };
  resultEl.addEventListener("keydown", function (e) {
    if (e.keyCode === self._keyCodes.enter) {
      self._goToFeatureLocation(feature);
      self._updateMarkers(feature);
    }
    if (e.keyCode === self._keyCodes.arrowUp) {
      if (self._resultsEl.childNodes[index - 1]) {
        self._resultsEl.childNodes[index - 1].focus();
      } else if (index - 1 === -1) {
        self._inputEl.focus();
      }
    }
    if (e.keyCode === self._keyCodes.arrowDown && self._resultsEl.childNodes[index + 1]) {
      self._resultsEl.childNodes[index + 1].focus();
    }
  });

  return resultEl;
};

// ---------------------------
// ---------- utils ----------
// ---------------------------

PeliasGeocoder.prototype._sendXmlHttpRequest = function (url, callback) {
  const req = new XMLHttpRequest();
  req.addEventListener('load', function () {
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
  });
  req.open('GET', url);
  req.send();
};

PeliasGeocoder.prototype._coordinatesToArray = function (coordinates) {
  return [coordinates.lng, coordinates.lat];
};

PeliasGeocoder.prototype._between = function (x, min, max) {
  return x >= min && x <= max;
};

PeliasGeocoder.prototype._getBestZoom = function (feature) {
  const bbox = feature.bbox;
  if (!bbox) {
    return (['address', 'venue', 'street'].indexOf(feature.properties.layer) > -1) ? 18 : 14;
  }
  const abs = Math.abs(bbox[2] - bbox[0]) * Math.abs(bbox[3] - bbox[1]);
  return abs !== 0 ? 8.5 - Math.log10(abs) : 8.5;
};

PeliasGeocoder.prototype._disableOrNotIcon = function (icon, mustBeDisabled) {
  const iconIsDisabled = icon.classList.contains('disabled');
  if (iconIsDisabled && !mustBeDisabled) {
    icon.classList.remove('disabled');
  } else if (!iconIsDisabled && mustBeDisabled) {
    icon.classList.add('disabled');
  }
};

PeliasGeocoder.prototype._useFlyTo = function (cameraOpts) {
  if (this.opts.flyTo === 'hybrid') {
    return this._areNear(cameraOpts.center, this._coordinatesToArray(this._map.getCenter()), this._getFlyToToleranceByZoom(this._map.getZoom()));
  }
  return this.opts.flyTo;
};

PeliasGeocoder.prototype._getFlyToToleranceByZoom = function (zoom) {
  return zoom < 3 ? 360 : 160 / Math.pow(zoom + 1, 2);
};

PeliasGeocoder.prototype._areNear = function (c1, c2, tolerance) {
  return this._between(c1[0], c2[0] - tolerance, c2[0] + tolerance) && this._between(c1[1], c2[1] - tolerance, c2[1] + tolerance);
};

PeliasGeocoder.prototype._removeSources = function (enabled, layer) {
  if (!enabled) {
    return;
  }
  if (this._map.getSource(layer)) {
    this._map.removeLayer(layer);
    this._map.removeSource(layer);
  }
};