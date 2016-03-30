var turfEnvelope = require('turf-envelope');


module.exports = function render() {
  var isStillAlive = this.ctx.map.getSource('mapbox-gl-draw-hot') !== undefined;
  if (isStillAlive) { // checks to make sure we still have a map
    var mode = this.ctx.events.currentModeName();

    var features = {
      hot: [],
      cold: []
    };

    var renderCold = this.isDirty;
    var renderCluster = this.isDirty;

    var nextHistory = {};

    var pusher = (geojson) => {
      var about = geojson.properties;
      var key = about.id + '.' + about.parent + '.' + about.coord_path + '.' + about.meta;
      var value = JSON.stringify(geojson);

      var past = this.renderHistory[key];

      if (past === undefined) {
        past = { changed: 4};
      }

      var next = {
        value: value,
        changed: past.changed
      };

      if (past.value !== value && next.changed < 4) {
        next.changed ++;
      }
      else if (past.value === value && next.changed > 0) {
        next.changed--;
      }

      if (about.meta === 'too-small') {
        features.cluster.push(geojson);
        renderCluster = renderCluster ? true : past.changed === 3;
      }
      else if (next.changed < 2) {
        features.cold.push(geojson);
        renderCold = renderCold ? true : next.changed !== past.changed;
      }
      else {
        renderCold = renderCold ? true : past.changed < 2;
        features.hot.push(geojson);
      }
      nextHistory[key] = next;
    };

    var changed = [];

    this.featureIds.forEach((id) => {
      let featureInternal = this.features[id].internal(mode);
      var coords = JSON.stringify(featureInternal.geometry.coordinates);
      this.featureHistory[id] = this.featureHistory[id] || '';

      if (this.featureHistory[id] !== coords) {
        this.featureHistory[id] = coords;
        changed.push(this.features[id].toGeoJSON());
      }

      var envelope = turfEnvelope({
        type: 'FeatureCollection',
        features: [featureInternal]
      });

      var topLeftCoord = envelope.geometry.coordinates[0][0];
      var bottomRightCoord = envelope.geometry.coordinates[0][2];

      var topLeftPixels = this.ctx.map.project({
        lng: topLeftCoord[0],
        lat: topLeftCoord[1]
      });

      var bottomRightPixels = this.ctx.map.project({
        lng: bottomRightCoord[0],
        lat: bottomRightCoord[1]
      });

      var dx = Math.abs(topLeftPixels.x - bottomRightPixels.x);
      var dy = Math.abs(topLeftPixels.y - bottomRightPixels.y);

      var distance = Math.pow((dx*dx) + (dy*dy), .5);

      if (distance < 10) {
        featureInternal.properties.meta = 'too-small';
        featureInternal.properties.point = topLeftCoord;
      }

      this.ctx.events.currentModeRender(featureInternal, pusher);
    });

    this.renderHistory = nextHistory;

    if (renderCold) {
      this.ctx.map.getSource('mapbox-gl-draw-cold').setData({
        type: 'FeatureCollection',
        features: features.cold
      });
    }

    this.ctx.map.getSource('mapbox-gl-draw-hot').setData({
      type: 'FeatureCollection',
      features: features.hot
    });

    this.ctx.map.fire('draw.changed', changed);
  }
  this.isDirty = false;
  this.zoomRender = this.zoomLevel;
};
