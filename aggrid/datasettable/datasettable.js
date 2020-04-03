angular.module('aggridDatasettable', ['servoy']).directive('aggridDatasettable', ['$sabloApplication', '$sabloConstants', '$log', '$formatterUtils', '$injector', '$services', '$sanitize', '$applicationService', '$windowService', '$filter', '$compile',
function($sabloApplication, $sabloConstants, $log, $formatterUtils, $injector, $services, $sanitize, $applicationService, $windowService, $filter, $compile) {
    return {
        restrict: 'E',
        scope: {
            model: '=svyModel',
            handlers: '=svyHandlers',
            api: '=svyApi',
            svyServoyapi: '='
        },
        controller: function($scope, $element, $attrs) {

            var gridDiv = $element.find('.ag-table')[0];
            var columnDefs = getColumnDefs();

            // position of cell with invalid data as reported by the return of onColumnDataChange
            var invalidCellDataIndex = { rowIndex: -1, colKey: ''};
            var onColumnDataChangePromise = null;

            // if aggrid service is present read its defaults
            var toolPanelConfig = null;
            var iconConfig = null;
            var userGridOptions = null;
            var localeText = null;
            var mainMenuItemsConfig = null;
            if($injector.has('ngPowerGrid')) {
                var datasettableDefaultConfig = $services.getServiceScope('ngPowerGrid').model;
                if(datasettableDefaultConfig.toolPanelConfig) {
                    toolPanelConfig = datasettableDefaultConfig.toolPanelConfig;
                }
                if(datasettableDefaultConfig.iconConfig) {
                    iconConfig = datasettableDefaultConfig.iconConfig;
                }
                if(datasettableDefaultConfig.gridOptions) {
                    userGridOptions = datasettableDefaultConfig.gridOptions;
                }                
                if(datasettableDefaultConfig.localeText) {
                    localeText = datasettableDefaultConfig.localeText;
                }
                if(datasettableDefaultConfig.mainMenuItemsConfig) {
                    mainMenuItemsConfig = datasettableDefaultConfig.mainMenuItemsConfig;
                }                
            }

            var config = $scope.model;

            function mergeConfig(target, source) {
				// clone target to avoid side effects
				var mergeConfig = {};
				for (property in target) {
					mergeConfig[property] = target[property];
				}
            	
                if(source) {
                    if(mergeConfig) {
                        for (property in source) {
                            if (source.hasOwnProperty(property)) {
                                mergeConfig[property] = source[property];
                            }
                        }
                    } else {
                        mergeConfig = source;
                    }
                }
                return mergeConfig;
            }

            toolPanelConfig = mergeConfig(toolPanelConfig, config.toolPanelConfig);
            iconConfig = mergeConfig(iconConfig, config.iconConfig);
            userGridOptions = mergeConfig(userGridOptions, config.gridOptions);
            localeText = mergeConfig(localeText, config.localeText);
            mainMenuItemsConfig = mergeConfig(mainMenuItemsConfig, config.mainMenuItemsConfig);
            
			var vMenuTabs = ['generalMenuTab','filterMenuTab'];
			
			if(config.showColumnsMenuTab) vMenuTabs.push('columnsMenuTab');
			
			var sideBar;
			if (toolPanelConfig && toolPanelConfig.suppressSideButtons === true) {
				sideBar = false;
			} else {
				sideBar = {
                    toolPanels: [
                    {
                        id: 'columns',
                        labelDefault: 'Columns',
                        labelKey: 'columns',
                        iconKey: 'columns',
                        toolPanel: 'agColumnsToolPanel',
                        toolPanelParams: {
                            suppressRowGroups: toolPanelConfig ? toolPanelConfig.suppressRowGroups : false,
                            suppressValues: toolPanelConfig ? toolPanelConfig.suppressValues : false,
                            suppressPivots: toolPanelConfig ? toolPanelConfig.suppressPivots : false,
                            suppressPivotMode: toolPanelConfig ? toolPanelConfig.suppressPivotMode : false,
                            suppressSideButtons: toolPanelConfig ? toolPanelConfig.suppressSideButtons : false,
                            suppressColumnFilter: toolPanelConfig ? toolPanelConfig.suppressColumnFilter : false,
                            suppressColumnSelectAll: toolPanelConfig ? toolPanelConfig.suppressColumnSelectAll : false,
                            suppressColumnExpandAll: toolPanelConfig ? toolPanelConfig.suppressColumnExpandAll : false
                        }
                    }                    
                ]};
			}

            $scope.showEditorHint = function() {
                return (!$scope.model.columns || $scope.model.columns.length == 0) && $scope.svyServoyapi.isInDesigner();
            }

            var contextMenuItems = [];

            var isGridReady = false;

            // AG grid definition
            var gridOptions = {
                
                debug: false,
                rowGroupPanelShow: 'always', // TODO expose property

                defaultColDef: {
                    width: 0,
                    filter: false,
//                    valueFormatter: displayValueFormatter,
                    menuTabs: vMenuTabs,
			        headerCheckboxSelection: false, //$scope.model.multiSelect === true ? isFirstColumn : false,	// FIXME triggers a long loop of onRowSelection event when a new selection is made.
                    checkboxSelection: $scope.model.multiSelect === true ? isFirstColumn : false,
                    sortable: config.enableSorting,
                    resizable: config.enableColumnResize
                },
                columnDefs: columnDefs,
                getMainMenuItems: getMainMenuItems,

                rowHeight: $scope.model.rowHeight,
                // TODO enable it ?					rowClass: $scope.model.rowStyleClass,	// add the class to each row

                headerHeight: $scope.model.headerHeight, // exposed property
				
                suppressContextMenu: false,
                suppressMovableColumns: false, // TODO persist column order changes
                suppressAutoSize: true,
                autoSizePadding: 25,
                suppressFieldDotNotation: true,

                // suppressMovingInCss: true,
                suppressColumnMoveAnimation: true,
                suppressAnimationFrame: true,
				
                rowSelection: $scope.model.multiSelect === true ? 'multiple' : 'single',
                rowDeselection: false,
//                suppressRowClickSelection: rowGroupColsDefault.length === 0 ? false : true,
                suppressCellSelection: false, // TODO implement focus lost/gained
                enableRangeSelection: false,

                stopEditingWhenGridLosesFocus: true,
                singleClickEdit: true,
                suppressClickEdit: false,
                enableGroupEdit: false,
                // groupUseEntireRow: false,
                // groupMultiAutoColumn: true,

                pivotMode: $scope.model.pivotMode,

                animateRows: false,
                enableCellExpressions: true,

                onGridReady: function() {
                    $log.debug("gridReady");
                    isGridReady = true;
                    if($scope.model.visible) {
                        if($scope.model._internalColumnState !== "_empty") {
                            $scope.model.columnState = $scope.model._internalColumnState;
                            // need to clear it, so the watch can be used, if columnState changes, and we want to apply the same _internalColumnState again
                            $scope.model._internalColumnState = "_empty";
                            $scope.svyServoyapi.apply('_internalColumnState');
                        }
                        restoreColumnsState();
                    }
                    gridOptions.onDisplayedColumnsChanged = function() {
                        sizeColumnsToFit();
                        storeColumnsState();
                    };
                    if($scope.handlers.onReady) {
                        $scope.handlers.onReady();
                    }
                    // without timeout the column don't fit automatically
                    setTimeout(function() {
                        sizeColumnsToFit();
                    }, 150);
                },
                getContextMenuItems: getContextMenuItems,
                autoGroupColumnDef: {
                    cellRenderer: DatasetTableGroupCellRenderer,
                    cellRendererParams : { suppressCount: false},
                    headerName: ' ',
                    cellClass: $scope.model.groupStyleClass
                },
				onGridSizeChanged: function() {
                    setTimeout(function() {
                        // if not yet destroyed
                        if(gridOptions.onGridSizeChanged) {
                            sizeColumnsToFit();
                        }
                    }, 150);
				},
//                onColumnEverythingChanged: storeColumnsState,	// do we need that ?, when is it actually triggered ?
                onSortChanged: storeColumnsState,
//                onFilterChanged: storeColumnsState,			 disable filter sets for now
//                onColumnVisible: storeColumnsState,			 covered by onDisplayedColumnsChanged
//                onColumnPinned: storeColumnsState,			 covered by onDisplayedColumnsChanged
                onColumnResized: storeColumnsState,				// NOT covered by onDisplayedColumnsChanged
//                onColumnRowGroupChanged: storeColumnsState,	 covered by onDisplayedColumnsChanged
//                onColumnValueChanged: storeColumnsState,
//                onColumnMoved: storeColumnsState,              covered by onDisplayedColumnsChanged
//                onColumnGroupOpened: storeColumnsState		 i don't think we need that, it doesn't include the open group in column state

                navigateToNextCell: selectionChangeNavigation,
                
                sideBar : sideBar,
                popupParent: gridDiv,
                enableBrowserTooltips: true,
                onToolPanelVisibleChanged : function(event) {
                    sizeColumnsToFit();
                },
                onCellEditingStopped : function(event) {
                    // don't allow escape if cell data is invalid
                    if(onColumnDataChangePromise == null) {
                        var rowIndex = event.rowIndex;
                        var colId = event.column.colId;
                        if(invalidCellDataIndex.rowIndex == rowIndex  && invalidCellDataIndex.colKey == colId) {
                            gridOptions.api.startEditingCell({
                                rowIndex: rowIndex,
                                colKey: colId
                            });
                        }
                    }
                },
                onCellEditingStarted : function(event) {
                    // don't allow editing another cell if we have an invalidCellData
                    if(invalidCellDataIndex.rowIndex != -1 && invalidCellDataIndex.colKey != '') {
                        var rowIndex = event.rowIndex;
                        var colId = event.column.colId;
                        if(invalidCellDataIndex.rowIndex != rowIndex  || invalidCellDataIndex.colKey != colId) {
                            gridOptions.api.stopEditing();
                            gridOptions.api.startEditingCell({
                                rowIndex: invalidCellDataIndex.rowIndex,
                                colKey: invalidCellDataIndex.colKey
                            });
                        }
                    }
                }                
            };

            // check if we have filters
            for(var i = 0; gridOptions.sideBar && gridOptions.sideBar.toolPanels && i < columnDefs.length; i++) {
                if(columnDefs[i].filter) {
                    gridOptions.sideBar.toolPanels.push({
                        id: 'filters',
                        labelDefault: 'Filters',
                        labelKey: 'filters',
                        iconKey: 'filter',
                        toolPanel: 'agFiltersToolPanel',
                    })
                    break;
                }
            }

            if($scope.model.useLazyLoading) {
                gridOptions.rowModelType = 'serverSide';
            }
            else {
                gridOptions.rowModelType = 'clientSide';
                gridOptions.rowData = $scope.model.data;
            }

            if($scope.model.rowStyleClassFunc) {
                var rowStyleClassFunc = eval($scope.model.rowStyleClassFunc);
                gridOptions.getRowClass = function(params) {
                    return rowStyleClassFunc(params.rowIndex, params.data, params.event);
                };
            }

            // set the icons
            if(iconConfig) {
                var icons = new Object();
                
                for (var iconName in iconConfig) {
                	if (iconName == "iconRefreshData") continue;
                	
                	var aggridIcon = iconName.slice(4);
                	aggridIcon = aggridIcon[0].toLowerCase() + aggridIcon.slice(1);
                	icons[aggridIcon] = getIconElement(iconConfig[iconName]);
                }
                
                // TODO expose property
//                icons.rowGroupPanel = " "
//                icons.pivotPanel = " "
//                icons.valuePanel = " "
                
                gridOptions.icons = icons
            }

            setHeight();

            // locale text
            if (localeText) {
                gridOptions['localeText'] = localeText; 
            }

            // fill user grid options properties
            if (userGridOptions) {
                for (var property in userGridOptions) {
                    if (userGridOptions.hasOwnProperty(property)) {
                        gridOptions[property] = userGridOptions[property];
                    }
                }
            }

            if(gridOptions.groupUseEntireRow) {
                var groupRowRendererFunc = groupRowInnerRenderer;
                if($scope.model.groupRowRendererFunc) {
                    groupRowRendererFunc = eval($scope.model.groupRowRendererFunc);
                }
                gridOptions.groupRowRenderer = DatasetTableGroupCellRenderer;
                gridOptions.groupRowInnerRenderer = groupRowRendererFunc;
            }

            // handle options that are dependent on gridOptions
            if(gridOptions["enableCharts"] && gridOptions["enableRangeSelection"]) {
                contextMenuItems.push("chartRange");
            }

            // init the grid. If is in designer render a mocked grid
            if ($scope.svyServoyapi.isInDesigner()) {
                $element.addClass("design-mode");
                var designGridOptions = {
                    rowModelType: 'clientSide',
                    columnDefs: columnDefs,
                    rowHeight: $scope.model.rowHeight,
                    rowData: []
                };

                // init the grid
                new agGrid.Grid(gridDiv, designGridOptions);
                return;
            } else {
                // init the grid
                new agGrid.Grid(gridDiv, gridOptions);
            }

			// register listener for selection changed
			gridOptions.api.addEventListener('rowSelected', onRowSelected);
			gridOptions.api.addEventListener('selectionChanged', onSelectionChanged);
            gridOptions.api.addEventListener('cellClicked', cellClickHandler);
			gridOptions.api.addEventListener('cellDoubleClicked', onCellDoubleClicked);
            gridOptions.api.addEventListener('displayedColumnsChanged', function() {
                sizeColumnsToFit();
            });


            if(!$scope.svyServoyapi.isInDesigner() && $scope.model.useLazyLoading) {

                function RemoteDatasource() {
                }

                RemoteDatasource.prototype.getRows = function(params) {
                    $scope.model.data = [];
                    $scope.model.lastRowIndex = null;
                    if($scope.handlers.onLazyLoadingGetRows) {
                        var request = params.request;
                        var filterModels = [];
                        for(var id in request.filterModel) {
                            filterModels.push({id: id, operator: request.filterModel[id].type, value: request.filterModel[id].filter })
                        }

                        var getRowsPromise = $scope.handlers.onLazyLoadingGetRows(
                            request.startRow,
                            request.endRow,
                            request.rowGroupCols,
                            request.valueCols,
                            request.pivotCols,
                            request.pivotMode,
                            request.groupKeys,
                            filterModels,
                            request.sortModel);
                        getRowsPromise.then(function() {
                            params.successCallback($scope.model.data, $scope.model.lastRowIndex);
                        });
                    }
                    else {
                        params.successCallback($scope.model.data, $scope.model.lastRowIndex);
                    }
                };

                gridOptions.api.setEnterpriseDatasource(new RemoteDatasource());
            }
            else {
                $scope.$watchCollection("model.data", function(newValue, oldValue) {
                    if(gridOptions) {
                        gridOptions.api.setRowData($scope.model.data);
                    }
                });
            }

            $scope.$watchCollection("model.columns", function(newValue, oldValue) {
                if(gridOptions) {
					// need to clear/remove old columns first, else the id for
					// the new columns will have the counter at the end (ex. "myid_1")
					// and that will broke our getColumn()
					gridOptions.api.setColumnDefs([]);
					gridOptions.api.setColumnDefs(getColumnDefs());
                }
            });

            $scope.$watch("model._internalColumnState", function(newValue, oldValue) {
                if(isGridReady && (newValue !== "_empty")) {
                    $scope.model.columnState = newValue;
                    // need to clear it, so the watch can be used, if columnState changes, and we want to apply the same _internalColumnState again
                    $scope.model._internalColumnState = "_empty";
                    $scope.svyServoyapi.apply('_internalColumnState');
                    if($scope.model.columnState) {
                        restoreColumnsState();
                    }
                    else {
                        gridOptions.columnApi.resetColumnState();
                    }
                }
            });

            function getDefaultCellRenderer(column) {
                return function(params) {
                    var value = params.value != null ? params.value : "";
                    var valueFormatted = params.valueFormatted != null ? params.valueFormatted : value;
                    
                    var returnValueFormatted = false;
                    if(column != null && column.showAs == 'html') {
                        value =  value && value.displayValue != undefined ? value.displayValue : value;
                    } else if(column != null && column.showAs == 'sanitizedHtml') {
                        value = $sanitize(value && value.displayValue != undefined ? value.displayValue : value)
                    } else if (value && value.contentType && value.contentType.indexOf('image/') == 0 && value.url) {
                        value = '<img class="ag-table-image-cell" src="' + value.url + '">';
                    } else {
                        returnValueFormatted = true;
                    }
                
                    if(value instanceof Date) returnValueFormatted = true;

                    return returnValueFormatted ? document.createTextNode(valueFormatted) : value;
                };
            }

            function onCellValueChanged(params) {
                var rowIndex = params.node.rowIndex;
                var colId = params.column.colId;

                // if we have an invalid cell data, ignore any updates for other cells
                if((invalidCellDataIndex.rowIndex != -1 && invalidCellDataIndex.rowIndex != rowIndex)
                    || (invalidCellDataIndex.colKey != '' && invalidCellDataIndex.colKey != colId)) {
                    return;
                }

                var newValue = params.newValue;
                var oldValue = params.oldValue;
                var oldValueStr = oldValue;
                if(oldValueStr == null) oldValueStr = "";

                var col = getColumn(params.colDef.field);
                // ignore types in compare only for non null values ("200"/200 are equals, but ""/0 is not)
                var isValueChanged = newValue != oldValueStr || (!newValue && newValue !== oldValueStr);
                if(col && col["dataprovider"] && (isValueChanged || invalidCellDataIndex.rowIndex != -1)) {
                    if($scope.handlers.onColumnDataChange && isValueChanged) {
                        var currentEditCells = gridOptions.api.getEditingCells();
                        onColumnDataChangePromise = $scope.handlers.onColumnDataChange(
                            rowIndex,
                            getColumnIndex(params.column.colId),
                            oldValue,
                            newValue,
                            createJSEvent()
                        );
                        onColumnDataChangePromise.then(function(r) {
                            if(r == false) {
                                // if old value was reset, clear invalid state
                                var currentValue = gridOptions.api.getValue(colId, params.node);
                                if(oldValue === currentValue) {
                                    invalidCellDataIndex.rowIndex = -1;
                                    invalidCellDataIndex.colKey = '';
                                }
                                else {
                                    invalidCellDataIndex.rowIndex = rowIndex;
                                    invalidCellDataIndex.colKey = colId;
                                }
                                var editCells = gridOptions.api.getEditingCells();
                                if(!editCells.length || (editCells[0].rowIndex != rowIndex || editCells[0].column.colId != colId)) {
                                    gridOptions.api.stopEditing();
                                    gridOptions.api.startEditingCell({
                                        rowIndex: rowIndex,
                                        colKey: colId
                                    });
                                    setTimeout(function() {
                                        gridOptions.api.forEachNode( function(node) {
                                            if (node.rowIndex === rowIndex) {
                                                node.setSelected(true, true);
                                            }
                                        });
                                    }, 0);
                                }
                            }
                            else {
                                invalidCellDataIndex.rowIndex = -1;
                                invalidCellDataIndex.colKey = '';
                                var editCells = gridOptions.api.getEditingCells();
                                if(editCells.length == 0 && currentEditCells.length != 0) {
                                    gridOptions.api.startEditingCell({
                                        rowIndex: currentEditCells[0].rowIndex,
                                        colKey: currentEditCells[0].column.colId
                                    });
                                }
                            }
                            onColumnDataChangePromise = null;
                        }).catch(function(e) {
                            $log.error(e);
                            invalidCellDataIndex.rowIndex = -1;
                            invalidCellDataIndex.colKey = '';
                            onColumnDataChangePromise = null;
                        });
                    }
                }
            }

            function getColumnDefs() {
                
                //create the column definitions from the specified columns in designer
                var colDefs = [];
                var colDef = { };
                var colGroups = { };
                var column;
                for (var i = 0; $scope.model.columns && i < $scope.model.columns.length; i++) {
                    column = $scope.model.columns[i];

                    //create a column definition based on the properties defined at design time
                    colDef = {
                        headerName: "" + (column["headerTitle"] ? column["headerTitle"] : "") + "",
                        headerTooltip: column["headerTooltip"] ? column["headerTooltip"] : null,
                        field: column["dataprovider"],
                        tooltipField: column["tooltip"] ? column["tooltip"] : null
                    };

                    // set id if defined
                    if(column.id) {
                        colDef.colId = column.id;
                    }

                    // styleClass
                    colDef.headerClass = 'ag-table-header ' + column.headerStyleClass;
                    colDef.cellClass = 'ag-table-cell ' + column.styleClass;


                    // column grouping & pivoting
                    colDef.enableRowGroup = column.enableRowGroup;
                    if (column.rowGroupIndex >= 0) colDef.rowGroupIndex = column.rowGroupIndex;

                    colDef.enablePivot = column.enablePivot;
                    if (column.pivotIndex >= 0) colDef.pivotIndex = column.pivotIndex;

                    if(column.aggFunc) colDef.aggFunc = column.aggFunc;
                    
                    // tool panel
                    if (column.enableToolPanel === false) colDef.suppressToolPanel = !column.enableToolPanel;

                    // column sizing
                    if (column.width || column.width === 0) colDef.width = column.width;
                    if (column.maxWidth) colDef.maxWidth = column.maxWidth;
                    if (column.minWidth || column.minWidth === 0) colDef.minWidth = column.minWidth;

                    // column resizing https://www.ag-grid.com/javascript-grid-resizing/
        			if (column.enableResize === false) colDef.resizable = column.enableResize;
        			if (column.autoResize === false) colDef.suppressSizeToFit = !column.autoResize;
                    
        			// sorting
        			if (column.enableSort === false) colDef.suppressSorting = !column.enableSort;
        			
        			// visibility
                    if (column.visible === false) colDef.hide = true;
                    
                    if (column.format) {
                        colDef.valueFormatter = createValueFormatter(column.format, column.formatType);
                    }

                    if(column.cellStyleClassFunc) {
                        colDef.cellClass = createColumnCallbackFunctionFromString(column.cellStyleClassFunc);
                    }

                    if(column.cellRendererFunc) {
                        colDef.cellRenderer = createColumnCallbackFunctionFromString(column.cellRendererFunc);
                    }
                    else {
                        colDef.cellRenderer = getDefaultCellRenderer(column);
                    }

                    if (column.filterType) {
                        colDef.filter = true;

                        if(column.filterType == 'TEXT') {
                            colDef.filter = 'agTextColumnFilter';
                        }
                        else if(column.filterType == 'NUMBER') {
                            colDef.filter = 'agNumberColumnFilter';
                        }
                        else if(column.filterType == 'DATE') {
                            colDef.filter = 'agDateColumnFilter';
                        }
                        
                        colDef.filterParams = { applyButton: true, clearButton: true, newRowsAction: 'keep', suppressAndOrCondition: true, caseSensitive: false };
                    }

                    if (column.editType) {
                        colDef.editable = !$scope.model.readOnly;

                        if(column.editType == 'TEXTFIELD') {
                            colDef.cellEditor = getTextEditor();
                        }
                        else if(column.editType == 'DATEPICKER') {
                            colDef.cellEditor = getDatePicker();
                        }
                        else if(column.editType == 'FORM') {
                            colDef.cellEditor = getFormEditor();
                        }

                        colDef.onCellValueChanged = onCellValueChanged;
                    }

                    var columnOptions = {};
                    if($injector.has('ngPowerGrid')) {
                        var datasettableDefaultConfig = $services.getServiceScope('ngPowerGrid').model;
                        if(datasettableDefaultConfig.columnOptions) {
                            columnOptions = datasettableDefaultConfig.columnOptions;
                        }
                    }

                    columnOptions = mergeConfig(columnOptions, column.columnDef);

                    if(columnOptions) {
                        for (var property in columnOptions) {
                            if (columnOptions.hasOwnProperty(property)) {
                                colDef[property] = columnOptions[property];
                            }
                        }
                    }

                    if(column.headerGroup) {
                        if(!colGroups[column.headerGroup]) {
                            colGroups[column.headerGroup] = {}
                            colGroups[column.headerGroup]['headerClass'] = column.headerGroupStyleClass;
                            colGroups[column.headerGroup]['children'] = [];

                        }
                        colGroups[column.headerGroup]['children'].push(colDef);
                    }
                    else {
                        colDefs.push(colDef);
                    }
                }

                for(var groupName in colGroups) {
                    var group = {};
                    group.headerName = groupName;
                    group.headerClass = colGroups[groupName]['headerClass']; 
                    group.children = colGroups[groupName]['children'];
                    colDefs.push(group);
                }

                return colDefs;
            }

            function isResponsive() {
                return !$scope.$parent.absoluteLayout;
            }
            
            function isFirstColumn(params) {
                var displayedColumns = params.columnApi.getAllDisplayedColumns();
                var thisIsFirstColumn = displayedColumns[0] === params.column;
                return thisIsFirstColumn;
            }


            function setHeight() {
				if (isResponsive()) {
					if ($scope.model.responsiveHeight) {
						gridDiv.style.height = $scope.model.responsiveHeight + 'px';
					} else {
						// when responsive height is 0 or undefined, use 100% of the parent container.
						gridDiv.style.height = '100%';
					}
				}
            }

            function sizeColumnsToFit() {
                if($scope.model.visible) {
                    gridOptions.api.sizeColumnsToFit();
                }
            }

            function getIconElement(iconStyleClass) {
                return '<i class="' + iconStyleClass + '"/>';
            }

            function getMainMenuItems(params) {
                // default items
                //					pinSubMenu: Submenu for pinning. Always shown.
                //					valueAggSubMenu: Submenu for value aggregation. Always shown.
                //					autoSizeThis: Auto-size the current column. Always shown.
                //					autoSizeAll: Auto-size all columns. Always shown.
                //					rowGroup: Group by this column. Only shown if column is not grouped.
                //					rowUnGroup: Un-group by this column. Only shown if column is grouped.
                //					resetColumns: Reset column details. Always shown.
                //					expandAll: Expand all groups. Only shown if grouping by at least one column.
                //					contractAll: Contract all groups. Only shown if grouping by at least one column.
                //					toolPanel: Show the tool panel.
                var items;
                if(mainMenuItemsConfig && !$.isEmptyObject(mainMenuItemsConfig)) {
                    items = [];
                    for (var key in mainMenuItemsConfig) {
                        if(mainMenuItemsConfig[key]) items.push(key);
                    }
                }
                else {
                    items = ['rowGroup', 'rowUnGroup'];
                }
                var menuItems = [];
                params.defaultItems.forEach(function(item) {
                    if (items.indexOf(item) > -1) {
                        menuItems.push(item);
                    }
                });
                return menuItems;
            }

            function getContextMenuItems(params) {
                return contextMenuItems;
            }

            function createColumnCallbackFunctionFromString(functionAsString) {
                var f = eval(functionAsString);
                return function(params) {
                    return f(params.rowIndex, params.data, params.colDef.colId != undefined ? params.colDef.colId : params.colDef.field, params.value, params.event);
                };                
            }

            function createValueFormatter(format, formatType) {
                return function(params) {
                    if(params.value != undefined) {
                        if(formatType == 'TEXT') {
                            if(format == '|U') {
                                return params.value.toUpperCase();
                            } else if(format == '|L') {
                                return params.value.toLowerCase();
                            }
                        }
                        return $formatterUtils.format(params.value,format,formatType);
                    }
                    return '';
                }
            }

            Object.defineProperty($scope.model, $sabloConstants.modelChangeNotifier, {
                configurable: true,
                value: function(property, value) {
                    switch (property) {
                        case "responsiveHeight":
                            setHeight();
                            break;
                    }
                }
            });
            
				/**
				 * Grid Event
				 * @private
				 *
				 * */
				function onRowSelected(event) {
					var node = event.node;
					
					if ($scope.handlers.onRowSelected && node && node.data) {
						// var selectIndex = node.rowIndex + 1; Selected index doesn't make sense for a dataset since the grid may change the dataset internally
						$scope.handlers.onRowSelected(node.data, node.selected, createJSEvent());
					}
				}
				
				function getDatasetIndex(rowData) {
					// TODO it make sense to return the rowData Index ?
					// If is a dataset is enought the row Data
				}

            
        	/**
			 * Grid Event
			 * @private
			 *
			 * */
			function onSelectionChanged(event) {
				// TODO i don't think i need that
				return;
			}

				function onCellClicked(params) {
					if ($scope.handlers.onCellClick && params.data && params.colDef.field) {
						$scope.handlers.onCellClick(params.data, params.colDef.colId != undefined ? params.colDef.colId : params.colDef.field, params.value, params.event);
					}
				}

				// grid handlers
				var clickTimer;
				function cellClickHandler(params) {
					if ($scope.handlers.onCellDoubleClick) {
						if (clickTimer) {
							clearTimeout(clickTimer);
							clickTimer = null;
						} else {
							clickTimer = setTimeout(function() {
									clickTimer = null;
									onCellClicked(params);
								}, 250);
						}
					} else {
						onCellClicked(params);
					}
				}

				/**
				 * On Double Click Event
				 *
				 * @private
				 * */
				function onCellDoubleClicked(params) {
					$log.debug(params);
					if ($scope.handlers.onCellDoubleClick) {
						if (params.data && params.colDef.field) {
							$scope.handlers.onCellDoubleClick(params.data, params.colDef.colId != undefined ? params.colDef.colId : params.colDef.field, params.value, params.event);
						}

					}
				}
				
				function selectionChangeNavigation(params) {
					var previousCell = params.previousCellDef;
					var suggestedNextCell = params.nextCellDef;
				 
					var KEY_UP = 38;
					var KEY_DOWN = 40;
					var KEY_LEFT = 37;
					var KEY_RIGHT = 39;
				 
					switch (params.key) {
						case KEY_DOWN:
							previousCell = params.previousCellDef;
							// set selected cell on current cell + 1
							gridOptions.api.forEachNode( function(node) {
								if (previousCell.rowIndex + 1 === node.rowIndex) {
									if ($scope.model.multiSelect) {
										// node.setSelected(true); // keep previus selection
									} else {
										node.setSelected(true, true);	// exclusive selection
									}
								}
							});
							return suggestedNextCell;
						case KEY_UP:
							previousCell = params.previousCellDef;
							// set selected cell on current cell - 1
							gridOptions.api.forEachNode( function(node) {
								if (previousCell.rowIndex - 1 === node.rowIndex) {
									if ($scope.model.multiSelect) {
										// node.setSelected(true); // keep previus selection
									} else {
										node.setSelected(true, true);	// exclusive selection
									}
								}
							});
							return suggestedNextCell;
						case KEY_LEFT:
						case KEY_RIGHT:
							return suggestedNextCell;
						default:
							throw "this will never happen, navigation is always on of the 4 keys above";
					}					
				}

            
			/**
			 * Create a JSEvent
			 *
			 * @return {JSEvent}
			 * */
			function createJSEvent() {
				var element = $element;
				var offset = element.offset();
				var x = offset.left;
				var y = offset.top;

				var event = document.createEvent("MouseEvents");
				event.initMouseEvent("click", false, true, window, 1, x, y, x, y, false, false, false, false, 0, null);
				return event;
			}

            function storeColumnsState() {
                if($scope.model.visible) {
                    var rowGroupColumns = gridOptions.columnApi.getRowGroupColumns();
                    var svyRowGroupColumnIds = [];
                    for(var i = 0; i < rowGroupColumns.length; i++) {
                        svyRowGroupColumnIds.push(rowGroupColumns[i].colId);
                    }

                    var columnState = {
                        columnState: gridOptions.columnApi.getColumnState(),
                        rowGroupColumnsState: svyRowGroupColumnIds,
                        isToolPanelShowing: gridOptions.api.isToolPanelShowing(),
                        isSideBarVisible: gridOptions.api.isSideBarVisible(),
                        // filterState: gridOptions.api.getFilterModel(), TODO persist column states
                        sortingState: gridOptions.api.getSortModel()
                    }
                    var newColumnState = JSON.stringify(columnState);
                    
                    if (newColumnState !== $scope.model.columnState) {
                        $scope.model.columnState = newColumnState;
                        $scope.svyServoyapi.apply('columnState');
                        if ($scope.handlers.onColumnStateChanged) {
                            $scope.handlers.onColumnStateChanged($scope.model.columnState);
                        }
                    }
                }
            }

            function restoreColumnsState() {
                if($scope.model.columnState) {
                    var columnStateJSON = null;

                    try {
                        columnStateJSON = JSON.parse($scope.model.columnState);
                    }
                    catch(e) {
                        $log.error(e);
                    }

                    if(columnStateJSON != null) {
                        if(Array.isArray(columnStateJSON.columnState) && columnStateJSON.columnState.length > 0) {
                            gridOptions.columnApi.setColumnState(columnStateJSON.columnState);
                        }

                        if(Array.isArray(columnStateJSON.rowGroupColumnsState) && columnStateJSON.rowGroupColumnsState.length > 0) {
                            gridOptions.columnApi.setRowGroupColumns(columnStateJSON.rowGroupColumnsState);
                        }

                        if(Array.isArray(columnStateJSON.sortingState) && columnStateJSON.sortingState.length > 0) {
                            gridOptions.columnApi.setSortModel(columnStateJSON.sortingState);
                        }

                        gridOptions.api.setSideBarVisible(columnStateJSON.isSideBarVisible);
                    }
                }
            }

            function groupRowInnerRenderer(params) {
                var label = '<span class="ag-group-label">' + params.node.key + '</span>';
                if(params.node.aggData) {
                    var needsSeparator = false;
                    for(var agg in params.node.aggData) {
                        var column = gridOptions.columnApi.getColumn(agg);
                        var columnText = column.aggFunc + '(' + column.colDef.headerName + ')';
                        var value = params.node.aggData[agg];
                        if(column.aggFunc != 'count' && column.colDef.valueFormatter) {
                            value = column.colDef.valueFormatter(value.value != undefined ? value : {'value': value });
                        }
                        if(needsSeparator) {
                            label += '<span class="ag-group-aggregate-separator">,</span>';
                        } else {
                            needsSeparator = true;
                        }
                        label += '<span class="ag-group-aggregate">' + columnText + ':</span><span class="ag-group-aggregate-value">'
                        + value + '</span>';
                    }
                }
                return label;
            }

            function getColumn(colId) {
                if($scope.model.columns) {
                    for (var i = 0; i < $scope.model.columns.length; i++) {
                        if($scope.model.columns[i]["id"] == colId || $scope.model.columns[i]["dataprovider"] == colId) {
                            return $scope.model.columns[i];
                        }
                    }
                }
                return null;
            }

            function getColumnIndex(colId) {
                if($scope.model.columns) {
                    for (var i = 0; i < $scope.model.columns.length; i++) {
                        if($scope.model.columns[i]["id"] == colId || $scope.model.columns[i]["dataprovider"] == colId) {
                            return i;
                        }
                    }
                }
                return -1;
            }

            function isTableGrouped() {
                var rowGroupCols = gridOptions.columnApi.getRowGroupColumns();
                return rowGroupCols && rowGroupCols.length > 0;
            }

            /**************************************************************************************************
             **************************************************************************************************
             *
             *  Cell editors
             *
             **************************************************************************************************
             **************************************************************************************************/

            function getTextEditor() {
                // function to act as a class
                function TextEditor() {}
            
                // gets called once before the renderer is used
                TextEditor.prototype.init = function(params) {
                    // create the cell
                    this.params = params;
                    this.eInput = document.createElement('input');
                    this.eInput.className = "ag-cell-edit-input";

                    var column = getColumn(params.column.colId);

                    this.initialValue = params.value;

                    var v = this.initialValue;
                    if(column && column.format) {
                        this.format = column.format;
                        if (this.format.maxLength) {
                            this.eInput.setAttribute('maxlength', this.format.maxLength);
                        }
                        if(this.format.edit) {
                            v = $formatterUtils.format(v, this.format.edit, this.format.type);
                        }

                        if (v && this.format.type == "TEXT") {
                            if (this.format.uppercase) v = v.toUpperCase();
                            else if (this.format.lowercase) v = v.toLowerCase();
                        }

                    }
                    this.initialDisplayValue = v;

                    var thisEditor = this;

                    if(config.arrowsUpDownMoveWhenEditing && config.arrowsUpDownMoveWhenEditing != 'NONE') {
                        this.keyDownListener = function (event) {
                            var isNavigationLeftRightKey = event.keyCode === 37 || event.keyCode === 39;
                            var isNavigationUpDownEntertKey = event.keyCode === 38 || event.keyCode === 40 || event.keyCode === 13;

                            if (isNavigationLeftRightKey || isNavigationUpDownEntertKey) {

                                if(isNavigationUpDownEntertKey) {
                                    var newEditingNode = null;
                                    var columnToCheck = thisEditor.params.column;
                                    var mustBeEditable = config.arrowsUpDownMoveWhenEditing == 'NEXTEDITABLECELL'
                                    if( event.keyCode == 38) { // UP
                                        if(thisEditor.params.rowIndex > 0) {
                                            gridOptions.api.forEachNode( function(node) {
                                                if (node.rowIndex <= (thisEditor.params.rowIndex - 1) &&
                                                    (!mustBeEditable || columnToCheck.isCellEditable(node))) {
                                                    newEditingNode = node;
                                                }
                                            });	
                                        }
                                    }
                                    else if (event.keyCode == 13 || event.keyCode == 40) { // ENTER/DOWN
                                        if( thisEditor.params.rowIndex < gridOptions.api.getModel().getRowCount() - 1) {
                                            gridOptions.api.forEachNode( function(node) {
                                                if (node.rowIndex >= (thisEditor.params.rowIndex + 1) &&
                                                    !newEditingNode && (!mustBeEditable || columnToCheck.isCellEditable(node))) {
                                                    newEditingNode = node;
                                                }
                                            });	
                                        }
                                    }
                                    gridOptions.api.stopEditing();
                                    if (newEditingNode) {
                                        newEditingNode.setSelected(true, true);

                                        if(columnToCheck.isCellEditable(newEditingNode)) {
                                            gridOptions.api.startEditingCell({
                                                rowIndex: newEditingNode.rowIndex,
                                                colKey: columnToCheck.colId
                                            });
                                        }
                                        else {
                                            gridOptions.api.setFocusedCell(newEditingNode.rowIndex, columnToCheck.colId);
                                        }
                                    }
                                    event.preventDefault();
                                }
                                event.stopPropagation();
                            }
                        };
                        this.eInput.addEventListener('keydown', this.keyDownListener);
                    }

                    this.keyPressListener = function (event) {
                        var isNavigationLeftRightKey = event.keyCode === 37 || event.keyCode === 39;
                        var isNavigationUpDownEntertKey = event.keyCode === 38 || event.keyCode === 40 || event.keyCode === 13;
                        
                        if(!(isNavigationLeftRightKey || isNavigationUpDownEntertKey) && $formatterUtils.testForNumbersOnly && thisEditor.format) {
                            return $formatterUtils.testForNumbersOnly(event, null, thisEditor.eInput, false, true, thisEditor.format);
                        }
                        else return true;
                    };
                    $(this.eInput).on('keypress', this.keyPressListener);
                };
            
                // gets called once when grid ready to insert the element
                TextEditor.prototype.getGui = function() {
                    return this.eInput;
                };
            
                // focus and select can be done after the gui is attached
                TextEditor.prototype.afterGuiAttached = function() {
                    this.eInput.value = this.initialDisplayValue;
                    this.eInput.focus();
                    this.eInput.select();
                    if(this.format && this.format.edit && this.format.isMask) {
                        var settings = {};
                        settings['placeholder'] = this.format.placeHolder ? this.format.placeHolder : " ";
                        if (this.format.allowedCharacters)
                            settings['allowedCharacters'] = this.format.allowedCharacters;

                        $(this.eInput).mask(this.format.edit, settings);
                    }
                };

                // returns the new value after editing
                TextEditor.prototype.getValue = function() {
                    var displayValue = this.eInput.value;
                    if(this.format) {
                        if(this.format.edit) {
                            displayValue = $formatterUtils.unformat(displayValue, this.format.edit, this.format.type, this.initialValue);
                        }
                        if (this.format.type == "TEXT" && (this.format.uppercase || this.format.lowercase)) {
                            if (this.format.uppercase) displayValue = displayValue.toUpperCase();
                            else if (this.format.lowercase) displayValue = displayValue.toLowerCase();
                        }
                    }

                    return displayValue;
                };

                TextEditor.prototype.destroy = function() {
                    this.eInput.removeEventListener('keydown', this.keyDownListener);
                    $(this.eInput).off('keypress', this.keyPressListener);
                };

                return TextEditor;
            }

            function getDatePicker() {
                // function to act as a class
                function Datepicker() {}
            
                // gets called once before the renderer is used
                Datepicker.prototype.init = function(params) {
                    // create the cell
                    this.params = params;
                    this.eInput = document.createElement('input');
                    this.eInput.className = "ag-cell-edit-input";

                    var options = {
                        widgetParent: $(document.body),
                        useCurrent : false,
                        useStrict : true,
                        showClear : true,
                        ignoreReadonly : true,
                        showTodayButton: true,
                        calendarWeeks: true,
                        showClose: true,
                        icons: {
                            close: 'glyphicon glyphicon-ok'
                        }
                    };

                    var locale = $sabloApplication.getLocale();
                    if (locale.language) {
                        options.locale = locale.language;
                    }
                    
                    var showISOWeeks = $applicationService.getUIProperty('ngCalendarShowISOWeeks');
                    if (showISOWeeks)
                    {
                        options.isoCalendarWeeks = true;
                    }	
                    
                    $(this.eInput).datetimepicker(options);

                    var editFormat = 'MM/dd/yyyy hh:mm a';
                    var column = getColumn(params.column.colId);
                    if(column && column.format) {
                        editFormat = column.format;
                    }
                    var theDateTimePicker = $(this.eInput).data('DateTimePicker');
                    theDateTimePicker.format(moment().toMomentFormatString(editFormat));
                    this.eInput.value = $filter("formatFilter")(params.value, editFormat, 'DATETIME');
                    
                    // set key binds
                    $(this.eInput).keydown(datepickerKeyDown);
                    
                    // key binds handler
                    function datepickerKeyDown(e) {
                        if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) {
                            return true;
                        }
                        
                        switch (e.keyCode) {
                        case 89: // y Yesterday
                            var x = $(e.target).data('DateTimePicker');
                            x.date(moment().add(-1, 'days'));
                            e.stopPropagation();
                                e.preventDefault();
                            break;
                        case 66: // b Beginning ot the month
                            var x = $(e.target).data('DateTimePicker');
                            x.date(moment().startOf('month'));
                            e.stopPropagation();
                                e.preventDefault();
                            break;
                        case 69: // e End of the month
                            var x = $(e.target).data('DateTimePicker');
                            x.date(moment().endOf('month'));
                            e.stopPropagation();
                            e.preventDefault();
                            break;
                        case 107: // + Add 1 day
                            var x = $(e.target).data('DateTimePicker');
                            if (x.date()) {
                                x.date(x.date().clone().add(1, 'd'));
                            }
                            e.stopPropagation();
                            e.preventDefault();
                            break;
                        case 109: // - Subtract 1 day
                            var x = $(e.target).data('DateTimePicker');
                            if (x.date()) {
                                x.date(x.date().clone().subtract(1, 'd'));
                            }
                            e.stopPropagation();
                            e.preventDefault();
                            break;
                        default:
                            break;
                        }
                            
                        return true;
                    };
                    
                };
            
                // gets called once when grid ready to insert the element
                Datepicker.prototype.getGui = function() {
                    return this.eInput;
                };
            
                // focus and select can be done after the gui is attached
                Datepicker.prototype.afterGuiAttached = function() {
                    this.eInput.focus();
                    this.eInput.select();
                };

                // returns the new value after editing
                Datepicker.prototype.getValue = function() {
                    $(this.eInput).change();
                    var theDateTimePicker = $(this.eInput).data('DateTimePicker');
                    var selectedDate = theDateTimePicker.date();
                    return selectedDate ? selectedDate.toDate() : null;
                };
            
                // any cleanup we need to be done here
                Datepicker.prototype.destroy = function() {
                    var theDateTimePicker = $(this.eInput).data('DateTimePicker');
                    if(theDateTimePicker) theDateTimePicker.destroy();
                };

                return Datepicker;
            }
				

            function getFormEditor() {
                function FormEditor() {}

                FormEditor.prototype.init = function(params) {
                    this.params = params;

                    $scope.model._internalFormEditorValue = params.value;
                    if($scope.handlers.onColumnFormEditStarted) {
                        $scope.handlers.onColumnFormEditStarted(
                            params.node.rowIndex, getColumnIndex(params.column.colId), params.value);
                    }

                    this.eGui = document.createElement("div");

                    var column = getColumn(params.column.colId);

                    $scope.ngEditFormUrl = null;
                    $scope.svyServoyapi.formWillShow(column.editForm).then(function successCallback() {
                        $scope.ngEditFormUrl = $windowService.getFormUrl(column.editForm);
                    }, function errorCallback(e) {
                        console.log(e);
                    });

                    $scope.getNGEditFormUrl = function() {
                        return $scope.ngEditFormUrl;
                    };

                    $scope.loadSize = function() {
                        $sabloApplication.getFormState(column.editForm).then(function(formState){
                            var css = {};
                            css["width"] = formState.properties.designSize.width + "px";
                            css["height"] = formState.properties.designSize.height + "px";
                            $('#ngformeditor').css(css);
                        })
                    };

                    this.eGui.innerHTML = '<div id=\'ngformeditor\' svyform="' + column.editForm + '" ng-include="getNGEditFormUrl()" onload="loadSize()"></div>';
                    $compile(this.eGui)($scope);
                };

                FormEditor.prototype.getGui = function() {
                    return this.eGui;
                };

                FormEditor.prototype.afterGuiAttached = function () {
                    gridOptions.api.setFocusedCell(this.params.node.rowIndex, this.params.column.colId);
                };

                FormEditor.prototype.isPopup = function() {
                    return true;
                };

                FormEditor.prototype.getValue = function() {
                    return $scope.model._internalFormEditorValue;
                };

                FormEditor.prototype.destroy = function() {
                    var column = getColumn(this.params.column.colId);
                    $scope.svyServoyapi.hideForm(column.editForm);						
                };

                return FormEditor;
            }

            /**
             * Export data to excel format (xlsx)
             * 
             * @param {String} fileName 
             * @param {Boolean} skipHeader 
             * @param {Boolean} columnGroups 
             * @param {Boolean} skipFooters 
             * @param {Boolean} skipGroups 
             * @param {Boolean} asCSV 
             */
            $scope.api.exportData = function(fileName, skipHeader, columnGroups, skipFooters, skipGroups, asCSV) {
                // set defaults
                if(fileName == undefined) {
                    fileName = 'export.xlsx';
                }
                if(skipHeader == undefined) {
                    skipHeader = false;
                }
                if(columnGroups == undefined) {
                    columnGroups = true;
                }
                if(skipFooters == undefined) {
                    skipFooters = false;
                }
                if(skipGroups == undefined) {
                    skipGroups = false;
                }
                if(asCSV == undefined) {
                    asCSV = false;
                }

                var params = {
                    fileName: fileName,
                    skipHeader: skipHeader,
                    columnGroups: columnGroups,
                    skipFooters: skipFooters,
                    skipGroups: skipGroups
                };
                if(asCSV) {
                    gridOptions.api.exportDataAsCsv(params);
                }
                else {
                    gridOptions.api.exportDataAsExcel(params);
                }
            }
            
            /**
             * Gets selected rows data
             * 
             * @return {Array<String>}
             */
            $scope.api.getSelectedRows = function() {
				var selectedNodes = gridOptions.api.getSelectedNodes();
				// TODO return the selected Nodes as JSON;
				var result = [];
				for (var i = 0; i < selectedNodes.length; i++) {
					var selectedNode = selectedNodes[i].data;
					result.push(selectedNode);
					//result.push({rowIndex:  selectedNodes[i].rowIndex, rowData: selectedNodes[i].data})
				}
				return result;
            }

            /**
             * Start cell editing (only works when the table is not in grouping mode).
             * @param rowindex row index of the editing cell (0-based)
             * @param columnindex column index in the model of the editing cell (0-based)
             */
            $scope.api.editCellAt = function(rowindex, columnindex) {
                if(isTableGrouped()) {
                    $log.warn('editCellAt API is not supported in grouped mode');
                }
                else if (rowindex < 0) {
                    $log.warn('editCellAt API, invalid rowindex:' + rowindex);
                }
                else if(columnindex < 0 || columnindex > $scope.model.columns.length - 1) {
                    $log.warn('editCellAt API, invalid columnindex:' + columnindex);
                }
                else {
                    var column = $scope.model.columns[columnindex];
                    var	colId = column["id"] ? column["id"] : column["dataprovider"];
                    setTimeout(function() {
                        gridOptions.api.startEditingCell({
                            rowIndex: rowindex,
                            colKey: colId
                        });
                    }, 0);
                }
            }

            /**
             * If a cell is editing, it stops the editing
             * @param cancel 'true' to cancel the editing (ie don't accept changes)
             */
            $scope.api.stopCellEditing = function(cancel) {
                gridOptions.api.stopEditing(cancel);
            }
        },
        templateUrl: 'aggrid/datasettable/datasettable.html'
    };
}]).run(function() {
    // this is not part of the open source license, can only be used in combination of the Servoy NG Grids components
    agGrid.LicenseManager.setLicenseKey("Servoy_B.V_Servoy_7Devs_200Deployment_11_October_2020__MTYwMjM3MDgwMDAwMA==26d908e26f73b44683ba7a5dfdd00755");
});