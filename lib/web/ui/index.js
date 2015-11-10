'use strict';

var $ = window.jQuery = window.$ = require('jquery'),
    angular = require('angular');

window.AdminLTEOptions = {
    'sidebarSlimScroll' : false,
    'sidebarPushMenu' : false,
    'enableBSToppltip' : false,
    'enableControlSidebar' : false,
    'enableBoxWidget' : false,
    'enableFastclick' : false
};

require('admin-lte/dist/js/app');

angular.bootstrap(global['document'], [
    require('./viewport')(angular, window).name
]);