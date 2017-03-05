/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 641.0, "minX": 0.0, "maxY": 2409.0, "series": [{"data": [[0.0, 641.0], [0.1, 641.0], [0.2, 641.0], [0.3, 641.0], [0.4, 641.0], [0.5, 641.0], [0.6, 641.0], [0.7, 641.0], [0.8, 641.0], [0.9, 641.0], [1.0, 645.0], [1.1, 645.0], [1.2, 645.0], [1.3, 645.0], [1.4, 645.0], [1.5, 645.0], [1.6, 645.0], [1.7, 645.0], [1.8, 645.0], [1.9, 645.0], [2.0, 646.0], [2.1, 646.0], [2.2, 646.0], [2.3, 646.0], [2.4, 646.0], [2.5, 646.0], [2.6, 646.0], [2.7, 646.0], [2.8, 646.0], [2.9, 646.0], [3.0, 648.0], [3.1, 648.0], [3.2, 648.0], [3.3, 648.0], [3.4, 648.0], [3.5, 648.0], [3.6, 648.0], [3.7, 648.0], [3.8, 648.0], [3.9, 648.0], [4.0, 650.0], [4.1, 650.0], [4.2, 650.0], [4.3, 650.0], [4.4, 650.0], [4.5, 650.0], [4.6, 650.0], [4.7, 650.0], [4.8, 650.0], [4.9, 650.0], [5.0, 656.0], [5.1, 656.0], [5.2, 656.0], [5.3, 656.0], [5.4, 656.0], [5.5, 656.0], [5.6, 656.0], [5.7, 656.0], [5.8, 656.0], [5.9, 656.0], [6.0, 657.0], [6.1, 657.0], [6.2, 657.0], [6.3, 657.0], [6.4, 657.0], [6.5, 657.0], [6.6, 657.0], [6.7, 657.0], [6.8, 657.0], [6.9, 657.0], [7.0, 657.0], [7.1, 657.0], [7.2, 657.0], [7.3, 657.0], [7.4, 657.0], [7.5, 657.0], [7.6, 657.0], [7.7, 657.0], [7.8, 657.0], [7.9, 657.0], [8.0, 657.0], [8.1, 657.0], [8.2, 657.0], [8.3, 657.0], [8.4, 657.0], [8.5, 657.0], [8.6, 657.0], [8.7, 657.0], [8.8, 657.0], [8.9, 657.0], [9.0, 662.0], [9.1, 662.0], [9.2, 662.0], [9.3, 662.0], [9.4, 662.0], [9.5, 662.0], [9.6, 662.0], [9.7, 662.0], [9.8, 662.0], [9.9, 662.0], [10.0, 665.0], [10.1, 665.0], [10.2, 665.0], [10.3, 665.0], [10.4, 665.0], [10.5, 665.0], [10.6, 665.0], [10.7, 665.0], [10.8, 665.0], [10.9, 665.0], [11.0, 665.0], [11.1, 665.0], [11.2, 665.0], [11.3, 665.0], [11.4, 665.0], [11.5, 665.0], [11.6, 665.0], [11.7, 665.0], [11.8, 665.0], [11.9, 665.0], [12.0, 669.0], [12.1, 669.0], [12.2, 669.0], [12.3, 669.0], [12.4, 669.0], [12.5, 669.0], [12.6, 669.0], [12.7, 669.0], [12.8, 669.0], [12.9, 669.0], [13.0, 671.0], [13.1, 671.0], [13.2, 671.0], [13.3, 671.0], [13.4, 671.0], [13.5, 671.0], [13.6, 671.0], [13.7, 671.0], [13.8, 671.0], [13.9, 671.0], [14.0, 672.0], [14.1, 672.0], [14.2, 672.0], [14.3, 672.0], [14.4, 672.0], [14.5, 672.0], [14.6, 672.0], [14.7, 672.0], [14.8, 672.0], [14.9, 672.0], [15.0, 677.0], [15.1, 677.0], [15.2, 677.0], [15.3, 677.0], [15.4, 677.0], [15.5, 677.0], [15.6, 677.0], [15.7, 677.0], [15.8, 677.0], [15.9, 677.0], [16.0, 679.0], [16.1, 679.0], [16.2, 679.0], [16.3, 679.0], [16.4, 679.0], [16.5, 679.0], [16.6, 679.0], [16.7, 679.0], [16.8, 679.0], [16.9, 679.0], [17.0, 684.0], [17.1, 684.0], [17.2, 684.0], [17.3, 684.0], [17.4, 684.0], [17.5, 684.0], [17.6, 684.0], [17.7, 684.0], [17.8, 684.0], [17.9, 684.0], [18.0, 686.0], [18.1, 686.0], [18.2, 686.0], [18.3, 686.0], [18.4, 686.0], [18.5, 686.0], [18.6, 686.0], [18.7, 686.0], [18.8, 686.0], [18.9, 686.0], [19.0, 689.0], [19.1, 689.0], [19.2, 689.0], [19.3, 689.0], [19.4, 689.0], [19.5, 689.0], [19.6, 689.0], [19.7, 689.0], [19.8, 689.0], [19.9, 689.0], [20.0, 690.0], [20.1, 690.0], [20.2, 690.0], [20.3, 690.0], [20.4, 690.0], [20.5, 690.0], [20.6, 690.0], [20.7, 690.0], [20.8, 690.0], [20.9, 690.0], [21.0, 690.0], [21.1, 690.0], [21.2, 690.0], [21.3, 690.0], [21.4, 690.0], [21.5, 690.0], [21.6, 690.0], [21.7, 690.0], [21.8, 690.0], [21.9, 690.0], [22.0, 702.0], [22.1, 702.0], [22.2, 702.0], [22.3, 702.0], [22.4, 702.0], [22.5, 702.0], [22.6, 702.0], [22.7, 702.0], [22.8, 702.0], [22.9, 702.0], [23.0, 702.0], [23.1, 702.0], [23.2, 702.0], [23.3, 702.0], [23.4, 702.0], [23.5, 702.0], [23.6, 702.0], [23.7, 702.0], [23.8, 702.0], [23.9, 702.0], [24.0, 702.0], [24.1, 702.0], [24.2, 702.0], [24.3, 702.0], [24.4, 702.0], [24.5, 702.0], [24.6, 702.0], [24.7, 702.0], [24.8, 702.0], [24.9, 702.0], [25.0, 703.0], [25.1, 703.0], [25.2, 703.0], [25.3, 703.0], [25.4, 703.0], [25.5, 703.0], [25.6, 703.0], [25.7, 703.0], [25.8, 703.0], [25.9, 703.0], [26.0, 714.0], [26.1, 714.0], [26.2, 714.0], [26.3, 714.0], [26.4, 714.0], [26.5, 714.0], [26.6, 714.0], [26.7, 714.0], [26.8, 714.0], [26.9, 714.0], [27.0, 716.0], [27.1, 716.0], [27.2, 716.0], [27.3, 716.0], [27.4, 716.0], [27.5, 716.0], [27.6, 716.0], [27.7, 716.0], [27.8, 716.0], [27.9, 716.0], [28.0, 723.0], [28.1, 723.0], [28.2, 723.0], [28.3, 723.0], [28.4, 723.0], [28.5, 723.0], [28.6, 723.0], [28.7, 723.0], [28.8, 723.0], [28.9, 723.0], [29.0, 726.0], [29.1, 726.0], [29.2, 726.0], [29.3, 726.0], [29.4, 726.0], [29.5, 726.0], [29.6, 726.0], [29.7, 726.0], [29.8, 726.0], [29.9, 726.0], [30.0, 732.0], [30.1, 732.0], [30.2, 732.0], [30.3, 732.0], [30.4, 732.0], [30.5, 732.0], [30.6, 732.0], [30.7, 732.0], [30.8, 732.0], [30.9, 732.0], [31.0, 737.0], [31.1, 737.0], [31.2, 737.0], [31.3, 737.0], [31.4, 737.0], [31.5, 737.0], [31.6, 737.0], [31.7, 737.0], [31.8, 737.0], [31.9, 737.0], [32.0, 740.0], [32.1, 740.0], [32.2, 740.0], [32.3, 740.0], [32.4, 740.0], [32.5, 740.0], [32.6, 740.0], [32.7, 740.0], [32.8, 740.0], [32.9, 740.0], [33.0, 746.0], [33.1, 746.0], [33.2, 746.0], [33.3, 746.0], [33.4, 746.0], [33.5, 746.0], [33.6, 746.0], [33.7, 746.0], [33.8, 746.0], [33.9, 746.0], [34.0, 746.0], [34.1, 746.0], [34.2, 746.0], [34.3, 746.0], [34.4, 746.0], [34.5, 746.0], [34.6, 746.0], [34.7, 746.0], [34.8, 746.0], [34.9, 746.0], [35.0, 748.0], [35.1, 748.0], [35.2, 748.0], [35.3, 748.0], [35.4, 748.0], [35.5, 748.0], [35.6, 748.0], [35.7, 748.0], [35.8, 748.0], [35.9, 748.0], [36.0, 754.0], [36.1, 754.0], [36.2, 754.0], [36.3, 754.0], [36.4, 754.0], [36.5, 754.0], [36.6, 754.0], [36.7, 754.0], [36.8, 754.0], [36.9, 754.0], [37.0, 756.0], [37.1, 756.0], [37.2, 756.0], [37.3, 756.0], [37.4, 756.0], [37.5, 756.0], [37.6, 756.0], [37.7, 756.0], [37.8, 756.0], [37.9, 756.0], [38.0, 756.0], [38.1, 756.0], [38.2, 756.0], [38.3, 756.0], [38.4, 756.0], [38.5, 756.0], [38.6, 756.0], [38.7, 756.0], [38.8, 756.0], [38.9, 756.0], [39.0, 766.0], [39.1, 766.0], [39.2, 766.0], [39.3, 766.0], [39.4, 766.0], [39.5, 766.0], [39.6, 766.0], [39.7, 766.0], [39.8, 766.0], [39.9, 766.0], [40.0, 770.0], [40.1, 770.0], [40.2, 770.0], [40.3, 770.0], [40.4, 770.0], [40.5, 770.0], [40.6, 770.0], [40.7, 770.0], [40.8, 770.0], [40.9, 770.0], [41.0, 789.0], [41.1, 789.0], [41.2, 789.0], [41.3, 789.0], [41.4, 789.0], [41.5, 789.0], [41.6, 789.0], [41.7, 789.0], [41.8, 789.0], [41.9, 789.0], [42.0, 790.0], [42.1, 790.0], [42.2, 790.0], [42.3, 790.0], [42.4, 790.0], [42.5, 790.0], [42.6, 790.0], [42.7, 790.0], [42.8, 790.0], [42.9, 790.0], [43.0, 804.0], [43.1, 804.0], [43.2, 804.0], [43.3, 804.0], [43.4, 804.0], [43.5, 804.0], [43.6, 804.0], [43.7, 804.0], [43.8, 804.0], [43.9, 804.0], [44.0, 804.0], [44.1, 804.0], [44.2, 804.0], [44.3, 804.0], [44.4, 804.0], [44.5, 804.0], [44.6, 804.0], [44.7, 804.0], [44.8, 804.0], [44.9, 804.0], [45.0, 805.0], [45.1, 805.0], [45.2, 805.0], [45.3, 805.0], [45.4, 805.0], [45.5, 805.0], [45.6, 805.0], [45.7, 805.0], [45.8, 805.0], [45.9, 805.0], [46.0, 808.0], [46.1, 808.0], [46.2, 808.0], [46.3, 808.0], [46.4, 808.0], [46.5, 808.0], [46.6, 808.0], [46.7, 808.0], [46.8, 808.0], [46.9, 808.0], [47.0, 813.0], [47.1, 813.0], [47.2, 813.0], [47.3, 813.0], [47.4, 813.0], [47.5, 813.0], [47.6, 813.0], [47.7, 813.0], [47.8, 813.0], [47.9, 813.0], [48.0, 827.0], [48.1, 827.0], [48.2, 827.0], [48.3, 827.0], [48.4, 827.0], [48.5, 827.0], [48.6, 827.0], [48.7, 827.0], [48.8, 827.0], [48.9, 827.0], [49.0, 831.0], [49.1, 831.0], [49.2, 831.0], [49.3, 831.0], [49.4, 831.0], [49.5, 831.0], [49.6, 831.0], [49.7, 831.0], [49.8, 831.0], [49.9, 831.0], [50.0, 834.0], [50.1, 834.0], [50.2, 834.0], [50.3, 834.0], [50.4, 834.0], [50.5, 834.0], [50.6, 834.0], [50.7, 834.0], [50.8, 834.0], [50.9, 834.0], [51.0, 844.0], [51.1, 844.0], [51.2, 844.0], [51.3, 844.0], [51.4, 844.0], [51.5, 844.0], [51.6, 844.0], [51.7, 844.0], [51.8, 844.0], [51.9, 844.0], [52.0, 848.0], [52.1, 848.0], [52.2, 848.0], [52.3, 848.0], [52.4, 848.0], [52.5, 848.0], [52.6, 848.0], [52.7, 848.0], [52.8, 848.0], [52.9, 848.0], [53.0, 853.0], [53.1, 853.0], [53.2, 853.0], [53.3, 853.0], [53.4, 853.0], [53.5, 853.0], [53.6, 853.0], [53.7, 853.0], [53.8, 853.0], [53.9, 853.0], [54.0, 861.0], [54.1, 861.0], [54.2, 861.0], [54.3, 861.0], [54.4, 861.0], [54.5, 861.0], [54.6, 861.0], [54.7, 861.0], [54.8, 861.0], [54.9, 861.0], [55.0, 866.0], [55.1, 866.0], [55.2, 866.0], [55.3, 866.0], [55.4, 866.0], [55.5, 866.0], [55.6, 866.0], [55.7, 866.0], [55.8, 866.0], [55.9, 866.0], [56.0, 871.0], [56.1, 871.0], [56.2, 871.0], [56.3, 871.0], [56.4, 871.0], [56.5, 871.0], [56.6, 871.0], [56.7, 871.0], [56.8, 871.0], [56.9, 871.0], [57.0, 880.0], [57.1, 880.0], [57.2, 880.0], [57.3, 880.0], [57.4, 880.0], [57.5, 880.0], [57.6, 880.0], [57.7, 880.0], [57.8, 880.0], [57.9, 880.0], [58.0, 894.0], [58.1, 894.0], [58.2, 894.0], [58.3, 894.0], [58.4, 894.0], [58.5, 894.0], [58.6, 894.0], [58.7, 894.0], [58.8, 894.0], [58.9, 894.0], [59.0, 895.0], [59.1, 895.0], [59.2, 895.0], [59.3, 895.0], [59.4, 895.0], [59.5, 895.0], [59.6, 895.0], [59.7, 895.0], [59.8, 895.0], [59.9, 895.0], [60.0, 898.0], [60.1, 898.0], [60.2, 898.0], [60.3, 898.0], [60.4, 898.0], [60.5, 898.0], [60.6, 898.0], [60.7, 898.0], [60.8, 898.0], [60.9, 898.0], [61.0, 909.0], [61.1, 909.0], [61.2, 909.0], [61.3, 909.0], [61.4, 909.0], [61.5, 909.0], [61.6, 909.0], [61.7, 909.0], [61.8, 909.0], [61.9, 909.0], [62.0, 922.0], [62.1, 922.0], [62.2, 922.0], [62.3, 922.0], [62.4, 922.0], [62.5, 922.0], [62.6, 922.0], [62.7, 922.0], [62.8, 922.0], [62.9, 922.0], [63.0, 935.0], [63.1, 935.0], [63.2, 935.0], [63.3, 935.0], [63.4, 935.0], [63.5, 935.0], [63.6, 935.0], [63.7, 935.0], [63.8, 935.0], [63.9, 935.0], [64.0, 943.0], [64.1, 943.0], [64.2, 943.0], [64.3, 943.0], [64.4, 943.0], [64.5, 943.0], [64.6, 943.0], [64.7, 943.0], [64.8, 943.0], [64.9, 943.0], [65.0, 949.0], [65.1, 949.0], [65.2, 949.0], [65.3, 949.0], [65.4, 949.0], [65.5, 949.0], [65.6, 949.0], [65.7, 949.0], [65.8, 949.0], [65.9, 949.0], [66.0, 952.0], [66.1, 952.0], [66.2, 952.0], [66.3, 952.0], [66.4, 952.0], [66.5, 952.0], [66.6, 952.0], [66.7, 952.0], [66.8, 952.0], [66.9, 952.0], [67.0, 953.0], [67.1, 953.0], [67.2, 953.0], [67.3, 953.0], [67.4, 953.0], [67.5, 953.0], [67.6, 953.0], [67.7, 953.0], [67.8, 953.0], [67.9, 953.0], [68.0, 962.0], [68.1, 962.0], [68.2, 962.0], [68.3, 962.0], [68.4, 962.0], [68.5, 962.0], [68.6, 962.0], [68.7, 962.0], [68.8, 962.0], [68.9, 962.0], [69.0, 963.0], [69.1, 963.0], [69.2, 963.0], [69.3, 963.0], [69.4, 963.0], [69.5, 963.0], [69.6, 963.0], [69.7, 963.0], [69.8, 963.0], [69.9, 963.0], [70.0, 964.0], [70.1, 964.0], [70.2, 964.0], [70.3, 964.0], [70.4, 964.0], [70.5, 964.0], [70.6, 964.0], [70.7, 964.0], [70.8, 964.0], [70.9, 964.0], [71.0, 969.0], [71.1, 969.0], [71.2, 969.0], [71.3, 969.0], [71.4, 969.0], [71.5, 969.0], [71.6, 969.0], [71.7, 969.0], [71.8, 969.0], [71.9, 969.0], [72.0, 974.0], [72.1, 974.0], [72.2, 974.0], [72.3, 974.0], [72.4, 974.0], [72.5, 974.0], [72.6, 974.0], [72.7, 974.0], [72.8, 974.0], [72.9, 974.0], [73.0, 976.0], [73.1, 976.0], [73.2, 976.0], [73.3, 976.0], [73.4, 976.0], [73.5, 976.0], [73.6, 976.0], [73.7, 976.0], [73.8, 976.0], [73.9, 976.0], [74.0, 985.0], [74.1, 985.0], [74.2, 985.0], [74.3, 985.0], [74.4, 985.0], [74.5, 985.0], [74.6, 985.0], [74.7, 985.0], [74.8, 985.0], [74.9, 985.0], [75.0, 985.0], [75.1, 985.0], [75.2, 985.0], [75.3, 985.0], [75.4, 985.0], [75.5, 985.0], [75.6, 985.0], [75.7, 985.0], [75.8, 985.0], [75.9, 985.0], [76.0, 987.0], [76.1, 987.0], [76.2, 987.0], [76.3, 987.0], [76.4, 987.0], [76.5, 987.0], [76.6, 987.0], [76.7, 987.0], [76.8, 987.0], [76.9, 987.0], [77.0, 997.0], [77.1, 997.0], [77.2, 997.0], [77.3, 997.0], [77.4, 997.0], [77.5, 997.0], [77.6, 997.0], [77.7, 997.0], [77.8, 997.0], [77.9, 997.0], [78.0, 1000.0], [78.1, 1000.0], [78.2, 1000.0], [78.3, 1000.0], [78.4, 1000.0], [78.5, 1000.0], [78.6, 1000.0], [78.7, 1000.0], [78.8, 1000.0], [78.9, 1000.0], [79.0, 1002.0], [79.1, 1002.0], [79.2, 1002.0], [79.3, 1002.0], [79.4, 1002.0], [79.5, 1002.0], [79.6, 1002.0], [79.7, 1002.0], [79.8, 1002.0], [79.9, 1002.0], [80.0, 1008.0], [80.1, 1008.0], [80.2, 1008.0], [80.3, 1008.0], [80.4, 1008.0], [80.5, 1008.0], [80.6, 1008.0], [80.7, 1008.0], [80.8, 1008.0], [80.9, 1008.0], [81.0, 1010.0], [81.1, 1010.0], [81.2, 1010.0], [81.3, 1010.0], [81.4, 1010.0], [81.5, 1010.0], [81.6, 1010.0], [81.7, 1010.0], [81.8, 1010.0], [81.9, 1010.0], [82.0, 1034.0], [82.1, 1034.0], [82.2, 1034.0], [82.3, 1034.0], [82.4, 1034.0], [82.5, 1034.0], [82.6, 1034.0], [82.7, 1034.0], [82.8, 1034.0], [82.9, 1034.0], [83.0, 1047.0], [83.1, 1047.0], [83.2, 1047.0], [83.3, 1047.0], [83.4, 1047.0], [83.5, 1047.0], [83.6, 1047.0], [83.7, 1047.0], [83.8, 1047.0], [83.9, 1047.0], [84.0, 1089.0], [84.1, 1089.0], [84.2, 1089.0], [84.3, 1089.0], [84.4, 1089.0], [84.5, 1089.0], [84.6, 1089.0], [84.7, 1089.0], [84.8, 1089.0], [84.9, 1089.0], [85.0, 1094.0], [85.1, 1094.0], [85.2, 1094.0], [85.3, 1094.0], [85.4, 1094.0], [85.5, 1094.0], [85.6, 1094.0], [85.7, 1094.0], [85.8, 1094.0], [85.9, 1094.0], [86.0, 1100.0], [86.1, 1100.0], [86.2, 1100.0], [86.3, 1100.0], [86.4, 1100.0], [86.5, 1100.0], [86.6, 1100.0], [86.7, 1100.0], [86.8, 1100.0], [86.9, 1100.0], [87.0, 1102.0], [87.1, 1102.0], [87.2, 1102.0], [87.3, 1102.0], [87.4, 1102.0], [87.5, 1102.0], [87.6, 1102.0], [87.7, 1102.0], [87.8, 1102.0], [87.9, 1102.0], [88.0, 1151.0], [88.1, 1151.0], [88.2, 1151.0], [88.3, 1151.0], [88.4, 1151.0], [88.5, 1151.0], [88.6, 1151.0], [88.7, 1151.0], [88.8, 1151.0], [88.9, 1151.0], [89.0, 1163.0], [89.1, 1163.0], [89.2, 1163.0], [89.3, 1163.0], [89.4, 1163.0], [89.5, 1163.0], [89.6, 1163.0], [89.7, 1163.0], [89.8, 1163.0], [89.9, 1163.0], [90.0, 1191.0], [90.1, 1191.0], [90.2, 1191.0], [90.3, 1191.0], [90.4, 1191.0], [90.5, 1191.0], [90.6, 1191.0], [90.7, 1191.0], [90.8, 1191.0], [90.9, 1191.0], [91.0, 1218.0], [91.1, 1218.0], [91.2, 1218.0], [91.3, 1218.0], [91.4, 1218.0], [91.5, 1218.0], [91.6, 1218.0], [91.7, 1218.0], [91.8, 1218.0], [91.9, 1218.0], [92.0, 1292.0], [92.1, 1292.0], [92.2, 1292.0], [92.3, 1292.0], [92.4, 1292.0], [92.5, 1292.0], [92.6, 1292.0], [92.7, 1292.0], [92.8, 1292.0], [92.9, 1292.0], [93.0, 1331.0], [93.1, 1331.0], [93.2, 1331.0], [93.3, 1331.0], [93.4, 1331.0], [93.5, 1331.0], [93.6, 1331.0], [93.7, 1331.0], [93.8, 1331.0], [93.9, 1331.0], [94.0, 1333.0], [94.1, 1333.0], [94.2, 1333.0], [94.3, 1333.0], [94.4, 1333.0], [94.5, 1333.0], [94.6, 1333.0], [94.7, 1333.0], [94.8, 1333.0], [94.9, 1333.0], [95.0, 1359.0], [95.1, 1359.0], [95.2, 1359.0], [95.3, 1359.0], [95.4, 1359.0], [95.5, 1359.0], [95.6, 1359.0], [95.7, 1359.0], [95.8, 1359.0], [95.9, 1359.0], [96.0, 1380.0], [96.1, 1380.0], [96.2, 1380.0], [96.3, 1380.0], [96.4, 1380.0], [96.5, 1380.0], [96.6, 1380.0], [96.7, 1380.0], [96.8, 1380.0], [96.9, 1380.0], [97.0, 1907.0], [97.1, 1907.0], [97.2, 1907.0], [97.3, 1907.0], [97.4, 1907.0], [97.5, 1907.0], [97.6, 1907.0], [97.7, 1907.0], [97.8, 1907.0], [97.9, 1907.0], [98.0, 2394.0], [98.1, 2394.0], [98.2, 2394.0], [98.3, 2394.0], [98.4, 2394.0], [98.5, 2394.0], [98.6, 2394.0], [98.7, 2394.0], [98.8, 2394.0], [98.9, 2394.0], [99.0, 2409.0], [99.1, 2409.0], [99.2, 2409.0], [99.3, 2409.0], [99.4, 2409.0], [99.5, 2409.0], [99.6, 2409.0], [99.7, 2409.0], [99.8, 2409.0], [99.9, 2409.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 500.0, "maxY": 78.0, "series": [{"data": [[1500.0, 1.0], [1000.0, 19.0], [2000.0, 2.0], [500.0, 78.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 500, "maxX": 2000.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 3.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 97.0, "series": [{"data": [[1.0, 97.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 3.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 8.533333333333333, "minX": 1.48871934E12, "maxY": 10.0, "series": [{"data": [[1.48871934E12, 10.0], [1.48871946E12, 10.0], [1.4887194E12, 10.0], [1.48871958E12, 8.533333333333333], [1.48871952E12, 10.0]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.48871958E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 756.0, "minX": 1.0, "maxY": 1089.0, "series": [{"data": [[8.0, 756.0], [4.0, 985.0], [2.0, 1002.0], [1.0, 1089.0], [10.0, 900.032608695652], [5.0, 963.0], [6.0, 974.0], [3.0, 987.0], [7.0, 790.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[9.559999999999999, 903.4899999999997]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 10.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 52.43333333333333, "minX": 1.48871934E12, "maxY": 14772.0, "series": [{"data": [[1.48871934E12, 9828.5], [1.48871946E12, 6391.316666666667], [1.4887194E12, 8847.083333333334], [1.48871958E12, 14772.0], [1.48871952E12, 9346.916666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.48871934E12, 80.66666666666667], [1.48871946E12, 52.43333333333333], [1.4887194E12, 72.6], [1.48871958E12, 121.0], [1.48871952E12, 76.63333333333334]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.48871958E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes/sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 831.1666666666666, "minX": 1.48871934E12, "maxY": 1112.75, "series": [{"data": [[1.48871934E12, 1112.75], [1.48871946E12, 839.1538461538461], [1.4887194E12, 866.2777777777778], [1.48871958E12, 831.1666666666666], [1.48871952E12, 876.6842105263157]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.48871958E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 799.0, "minX": 1.48871934E12, "maxY": 1086.1499999999999, "series": [{"data": [[1.48871934E12, 1086.1499999999999], [1.48871946E12, 811.4615384615386], [1.4887194E12, 848.5555555555557], [1.48871958E12, 799.0], [1.48871952E12, 853.7894736842104]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.48871958E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 212.23076923076925, "minX": 1.48871934E12, "maxY": 546.25, "series": [{"data": [[1.48871934E12, 546.25], [1.48871946E12, 212.23076923076925], [1.4887194E12, 217.5], [1.48871958E12, 239.9333333333334], [1.48871952E12, 296.8421052631579]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.48871958E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 641.0, "minX": 1.48871934E12, "maxY": 2409.0, "series": [{"data": [[1.48871934E12, 2409.0], [1.48871946E12, 1333.0], [1.4887194E12, 1359.0], [1.48871958E12, 1191.0], [1.48871952E12, 1331.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.48871934E12, 646.0], [1.48871946E12, 641.0], [1.4887194E12, 657.0], [1.48871958E12, 648.0], [1.48871952E12, 645.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.48871934E12, 2345.300000000001], [1.48871946E12, 1353.8000000000002], [1.4887194E12, 1432.7000000000007], [1.48871958E12, 1188.2000000000003], [1.48871952E12, 1327.1]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.48871934E12, 2409.0], [1.48871946E12, 2409.0], [1.4887194E12, 2409.0], [1.48871958E12, 2408.85], [1.48871952E12, 2409.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.48871934E12, 2408.25], [1.48871946E12, 2101.7999999999993], [1.4887194E12, 2394.75], [1.48871958E12, 1357.6999999999998], [1.48871952E12, 1617.1500000000015]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.48871958E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 756.0, "minX": 13.0, "maxY": 939.0, "series": [{"data": [[18.0, 804.5], [19.0, 804.0], [20.0, 939.0], [13.0, 756.0], [30.0, 801.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 30.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time (ms)",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 732.0, "minX": 13.0, "maxY": 917.5, "series": [{"data": [[18.0, 786.5], [19.0, 783.0], [20.0, 917.5], [13.0, 732.0], [30.0, 780.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 30.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency (ms)",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 0.23333333333333334, "minX": 1.48871934E12, "maxY": 0.5, "series": [{"data": [[1.48871934E12, 0.3333333333333333], [1.48871946E12, 0.2833333333333333], [1.4887194E12, 0.31666666666666665], [1.48871958E12, 0.5], [1.48871952E12, 0.23333333333333334]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.48871958E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 0.21666666666666667, "minX": 1.48871934E12, "maxY": 0.5, "series": [{"data": [[1.48871934E12, 0.3333333333333333], [1.48871946E12, 0.21666666666666667], [1.4887194E12, 0.3], [1.48871958E12, 0.5], [1.48871952E12, 0.31666666666666665]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.48871958E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses/sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 0.21666666666666667, "minX": 1.48871934E12, "maxY": 0.5, "series": [{"data": [[1.48871934E12, 0.3333333333333333], [1.48871946E12, 0.21666666666666667], [1.4887194E12, 0.3], [1.48871958E12, 0.5], [1.48871952E12, 0.31666666666666665]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.48871958E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
