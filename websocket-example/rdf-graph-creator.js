// adpated from https://bl.ocks.org/cjrd/6863459
// "Interactive tool for creating directed graphs using d3.js."

var GraphCreator = null;

import { graphDatabase, graphObject, rdfDatabase, rdfEnvironment, SPARQL}
  from '../rdf-client.js';

function runGraphCreator(d3) {
  "use strict";

  // TODO add user settings
  var consts = {
    defaultTitle: "random variable"
  };
  var settings = {
    appendElSpec: "#graph"
  };
  // define graphcreator object
  GraphCreator = function(svg, nodes, edges){
    var thisGraph = this;
    thisGraph.idct = 0;

    thisGraph.nodes = nodes || [];
    thisGraph.edges = edges || [];

    window.GCI = thisGraph;

    thisGraph.state = {
      selectedNode: null,
      selectedEdge: null,
      mouseDownNode: null,
      mouseDownLink: null,
      justDragged: false,
      justScaleTransGraph: false,
      lastKeyDown: -1,
      shiftNodeDrag: false,
      selectedText: null
    };
    this.replica = null;
    this.transaction = null;

    // define arrow markers for graph links
    var defs = svg.append('svg:defs');
    defs.append('svg:marker')
      .attr('id', 'end-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', "32")
      .attr('markerWidth', 3.5)
      .attr('markerHeight', 3.5)
      .attr('orient', 'auto')
      .append('svg:path')
      .attr('d', 'M0,-5L10,0L0,5');

    // define arrow markers for leading arrow
    defs.append('svg:marker')
      .attr('id', 'mark-end-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 7)
      .attr('markerWidth', 3.5)

      .attr('markerHeight', 3.5)
      .attr('orient', 'auto')
      .append('svg:path')
      .attr('d', 'M0,-5L10,0L0,5');

    thisGraph.svg = svg;
    thisGraph.svgG = svg.append("g")
          .classed(thisGraph.consts.graphClass, true);
    var svgG = thisGraph.svgG;

    // displayed when dragging between nodes
    thisGraph.dragLine = svgG.append('svg:path')
          .attr('class', 'link dragline hidden')
          .attr('d', 'M0,0L0,0')
          .style('marker-end', 'url(#mark-end-arrow)');

    // svg nodes and edges
    thisGraph.paths = svgG.append("g").selectAll("g");
    thisGraph.circles = svgG.append("g").selectAll("g");

    thisGraph.drag = d3.behavior.drag()
          .origin(function(d){
            return {x: d.x, y: d.y};
          })
          .on("drag", function(args){
            thisGraph.state.justDragged = true;
            thisGraph.dragmove.call(thisGraph, args);
          })
          .on("dragend", function() {
            // todo check if edge-mode is selected
          });

    // listen for key events
    d3.select(window).on("keydown", function(){
      thisGraph.svgKeyDown.call(thisGraph);
    })
    .on("keyup", function(){
      thisGraph.svgKeyUp.call(thisGraph);
    });
    svg.on("mousedown", function(d){thisGraph.svgMouseDown.call(thisGraph, d);});
    svg.on("mouseup", function(d){thisGraph.svgMouseUp.call(thisGraph, d);});

    // listen for dragging
    var dragSvg = d3.behavior.zoom()
          .on("zoom", function(){
            if (d3.event.sourceEvent.shiftKey){
              // TODO  the internal d3 state is still changing
              return false;
            } else{
              thisGraph.zoomed.call(thisGraph);
            }
            return true;
          })
          .on("zoomstart", function(){
            var ael = d3.select("#" + thisGraph.consts.activeEditId).node();
            if (ael){
              ael.blur();
            }
            if (!d3.event.sourceEvent.shiftKey) d3.select('body').style("cursor", "move");
          })
          .on("zoomend", function(){
            d3.select('body').style("cursor", "auto");
          });

    svg.call(dragSvg).on("dblclick.zoom", null);

    // listen for resize
    window.onresize = function(){thisGraph.updateWindow(svg);};

    // handle delete graph
    d3.select("#delete-graph").on("click", function(){
      thisGraph.deleteGraph(false);
    });

    // console.log('create initial transaction');
    // thisGraph.transaction = this.ensureReplica().transaction('default');
  };

  GraphCreator.prototype.setIdCt = function(idct){
    this.idct = idct;
  };

  GraphCreator.prototype.consts =  {
    selectedClass: "selected",
    connectClass: "connect-node",
    circleGClass: "conceptG",
    graphClass: "graph",
    activeEditId: "active-editing",
    BACKSPACE_KEY: 8,
    DELETE_KEY: 46,
    ENTER_KEY: 13,
    nodeRadius: 50
  };

  /* PROTOTYPE FUNCTIONS */

  GraphCreator.prototype.dragmove = function(d) {
    var thisGraph = this;
    if (thisGraph.state.shiftNodeDrag){
      thisGraph.dragLine.attr('d', 'M' + d.x + ',' + d.y + 'L' + d3.mouse(thisGraph.svgG.node())[0] + ',' + d3.mouse(this.svgG.node())[1]);
    } else{
      d.x += d3.event.dx;
      d.y +=  d3.event.dy;
      thisGraph.updateGraph();
    }
  };

  GraphCreator.prototype.deleteGraph = function(skipPrompt){
    var thisGraph = this,
        doDelete = true;
    if (!skipPrompt){
      doDelete = window.confirm("Press OK to delete this graph");
    }
    if(doDelete){
      thisGraph.nodes.forEach(function(node) { this.replica.delete(node); });
      thisGraph.nodes = [];
      thisGraph.edges.forEach(function(edge) { this.replica.delete(edge); });
      thisGraph.edges = [];
      thisGraph.updateGraph();
    }
  };

  /* select all text in element: taken from http://stackoverflow.com/questions/6139107/programatically-select-text-in-a-contenteditable-html-element */
  GraphCreator.prototype.selectElementContents = function(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };


  /* insert svg line breaks: taken from http://stackoverflow.com/questions/13241475/how-do-i-include-newlines-in-labels-in-d3-charts */
  GraphCreator.prototype.insertTitleLinebreaks = function (gEl, title) {
    var words = title.split(/\s+/g),
        nwords = words.length;
    var el = gEl.append("text")
          .attr("text-anchor","middle")
          .attr("dy", "-" + (nwords-1)*7.5);

    for (var i = 0; i < words.length; i++) {
      var tspan = el.append('tspan').text(words[i]);
      if (i > 0)
        tspan.attr('x', 0).attr('dy', '15');
    }
  };


  // remove edges associated with a node
  GraphCreator.prototype.spliceLinksForNode = function(node) {
    var thisGraph = this,
        toSplice = thisGraph.edges.filter(function(l) {
      return (l.source === node || l.target === node);
    });
    toSplice.map(function(l) {
      this.replica.delete(l);
      thisGraph.edges.splice(thisGraph.edges.indexOf(l), 1);
    });
  };

  GraphCreator.prototype.replaceSelectEdge = function(d3Path, edgeData){
    var thisGraph = this;
    d3Path.classed(thisGraph.consts.selectedClass, true);
    if (thisGraph.state.selectedEdge){
      thisGraph.removeSelectFromEdge();
    }
    thisGraph.state.selectedEdge = edgeData;
  };

  GraphCreator.prototype.replaceSelectNode = function(d3Node, nodeData){
    var thisGraph = this;
    d3Node.classed(this.consts.selectedClass, true);
    if (thisGraph.state.selectedNode){
      thisGraph.removeSelectFromNode();
    }
    thisGraph.state.selectedNode = nodeData;
  };

  GraphCreator.prototype.removeSelectFromNode = function(){
    var thisGraph = this;
    thisGraph.circles.filter(function(cd){
      return cd.id === thisGraph.state.selectedNode.id;
    }).classed(thisGraph.consts.selectedClass, false);
    thisGraph.state.selectedNode = null;
  };

  GraphCreator.prototype.removeSelectFromEdge = function(){
    var thisGraph = this;
    thisGraph.paths.filter(function(cd){
      return cd === thisGraph.state.selectedEdge;
    }).classed(thisGraph.consts.selectedClass, false);
    thisGraph.state.selectedEdge = null;
  };

  GraphCreator.prototype.pathMouseDown = function(d3path, d){
    var thisGraph = this,
        state = thisGraph.state;
    d3.event.stopPropagation();
    state.mouseDownLink = d;

    if (state.selectedNode){
      thisGraph.removeSelectFromNode();
    }

    var prevEdge = state.selectedEdge;
    if (!prevEdge || prevEdge !== d){
      thisGraph.replaceSelectEdge(d3path, d);
    } else{
      thisGraph.removeSelectFromEdge();
    }
  };

  // mousedown on node
  GraphCreator.prototype.circleMouseDown = function(d3node, d){
    var thisGraph = this,
        state = thisGraph.state;
    d3.event.stopPropagation();
    state.mouseDownNode = d;
    if (d3.event.shiftKey){
      state.shiftNodeDrag = d3.event.shiftKey;
      // reposition dragged directed edge
      thisGraph.dragLine.classed('hidden', false)
        .attr('d', 'M' + d.x + ',' + d.y + 'L' + d.x + ',' + d.y);
      return;
    }
  };

  /* place editable text on node in place of svg text */
  GraphCreator.prototype.changeTextOfNode = function(d3node, d){
    var thisGraph= this,
        consts = thisGraph.consts,
        htmlEl = d3node.node();
    d3node.selectAll("text").remove();
    var nodeBCR = htmlEl.getBoundingClientRect(),
        curScale = nodeBCR.width/consts.nodeRadius,
        placePad  =  5*curScale,
        useHW = curScale > 1 ? nodeBCR.width*0.71 : consts.nodeRadius*1.42;
    // replace with editableconent text
    var d3txt = thisGraph.svg.selectAll("foreignObject")
          .data([d])
          .enter()
          .append("foreignObject")
          .attr("x", nodeBCR.left + placePad )
          .attr("y", nodeBCR.top + placePad)
          .attr("height", 2*useHW)
          .attr("width", useHW)
          .append("xhtml:p")
          .attr("id", consts.activeEditId)
          .attr("contentEditable", "true")
          .text(d.title)
          .on("mousedown", function(d){
            d3.event.stopPropagation();
          })
          .on("keydown", function(d){
            d3.event.stopPropagation();
            if (d3.event.keyCode == consts.ENTER_KEY && !d3.event.shiftKey){
              this.blur();
            }
          })
          .on("blur", function(d){
            d.title = this.textContent;
            thisGraph.insertTitleLinebreaks(d3node, d.title);
            d3.select(this.parentElement).remove();
          });
    return d3txt;
  };

  // mouseup on nodes
  GraphCreator.prototype.circleMouseUp = function(d3node, d){
    var thisGraph = this,
        state = thisGraph.state,
        consts = thisGraph.consts;
    // reset the states
    state.shiftNodeDrag = false;
    d3node.classed(consts.connectClass, false);

    var mouseDownNode = state.mouseDownNode;

    if (!mouseDownNode) return;

    thisGraph.dragLine.classed("hidden", true);

    if (mouseDownNode !== d){
      // we're in a different node: create new edge for mousedown edge and add to graph
      var newEdge = new Edge(thisGraph, mouseDownNode, d);
      var filtRes = thisGraph.paths.filter(function(d){
        if (d.source === newEdge.target && d.target === newEdge.source){
          thisGraph.edges.splice(thisGraph.edges.indexOf(d), 1);
        }
        return d.source === newEdge.source && d.target === newEdge.target;
      });
      if (!filtRes[0].length){
        thisGraph.edges.push(newEdge);
        this.ensureReplica().findObjectStore('default').attach(newEdge);
        thisGraph.updateGraph();
      }
    } else{
      // we're in the same node
      if (state.justDragged) {
        // dragged, not clicked
        state.justDragged = false;
      } else{
        // clicked, not dragged
        if (d3.event.shiftKey){
          // shift-clicked node: edit text content
          var d3txt = thisGraph.changeTextOfNode(d3node, d);
          var txtNode = d3txt.node();
          thisGraph.selectElementContents(txtNode);
          txtNode.focus();
        } else{
          if (state.selectedEdge){
            thisGraph.removeSelectFromEdge();
          }
          var prevNode = state.selectedNode;

          if (!prevNode || prevNode.id !== d.id){
            thisGraph.replaceSelectNode(d3node, d);
          } else{
            thisGraph.removeSelectFromNode();
          }
        }
      }
    }
    state.mouseDownNode = null;
    return;

  }; // end of circles mouseup

  // mousedown on main svg
  GraphCreator.prototype.svgMouseDown = function(){
    this.state.graphMouseDown = true;
  };

  // mouseup on main svg
  GraphCreator.prototype.svgMouseUp = function(){
    var thisGraph = this,
        state = thisGraph.state;
    if (state.justScaleTransGraph) {
      // dragged not clicked
      state.justScaleTransGraph = false;
    } else if (state.graphMouseDown && d3.event.shiftKey){
      // clicked not dragged from svg
      var xycoords = d3.mouse(thisGraph.svgG.node()),
          d = new Node(thisGraph, consts.defaultTitle, xycoords[0], xycoords[1])
      thisGraph.nodes.push(d);
      this.ensureReplica().findObjectStore('default').attach(d);
      thisGraph.updateGraph();
      // make title of text immediently editable
      var d3txt = thisGraph.changeTextOfNode(thisGraph.circles.filter(function(dval){
        return dval.id === d.id;
      }), d),
          txtNode = d3txt.node();
      thisGraph.selectElementContents(txtNode);
      txtNode.focus();
    } else if (state.shiftNodeDrag){
      // dragged from node
      state.shiftNodeDrag = false;
      thisGraph.dragLine.classed("hidden", true);
    }
    state.graphMouseDown = false;
  };

  // keydown on main svg
  GraphCreator.prototype.svgKeyDown = function() {
    var thisGraph = this,
        state = thisGraph.state,
        consts = thisGraph.consts;
    // make sure repeated key presses don't register for each keydown
    if(state.lastKeyDown !== -1) return;

    state.lastKeyDown = d3.event.keyCode;
    var selectedNode = state.selectedNode,
        selectedEdge = state.selectedEdge;

    switch(d3.event.keyCode) {
    case consts.BACKSPACE_KEY:
    case consts.DELETE_KEY:
      d3.event.preventDefault();
      if (selectedNode){
        thisGraph.nodes.splice(thisGraph.nodes.indexOf(selectedNode), 1);
        thisGraph.spliceLinksForNode(selectedNode);
        this.ensureReplica().findObjectStore('default').delete(selectedNode);
        state.selectedNode = null;
        thisGraph.updateGraph();
      } else if (selectedEdge){
        thisGraph.edges.splice(thisGraph.edges.indexOf(selectedEdge), 1);
        this.ensureReplica().findObjectStore('default').delete(selectedEdge);
        state.selectedEdge = null;
        thisGraph.updateGraph();
      }
      break;
    }
  };

  GraphCreator.prototype.svgKeyUp = function() {
    this.state.lastKeyDown = -1;
  };

  // call to propagate changes to graph
  GraphCreator.prototype.updateGraph = function(){
    var thisGraph = this
    console.log(`updateGraph: ? '${thisGraph.transaction}’`);
    if (thisGraph.transaction) {
      console.log('updateGraph.commit');
      thisGraph.replica.authentication = thisGraph.authentication();
      thisGraph.replica.location = thisGraph.location();
      thisGraph.transaction.commit();
    } ; 

    thisGraph.updateGraphView()

    console.log('updateGraph.newtransaction');
    thisGraph.transaction = thisGraph.ensureReplica().transaction('default');
    console.log('updateGraph.return');
  };

  // update view presentation only
  GraphCreator.prototype.updateGraphView = function(){
    console.log('updateGraphView');
    var thisGraph = this,
        consts = thisGraph.consts,
        state = thisGraph.state;
    thisGraph.paths = thisGraph.paths.data(thisGraph.edges, function(d){
      return String(d.source.id) + "+" + String(d.target.id);
    });
    var paths = thisGraph.paths;
    // update existing paths
    paths.style('marker-end', 'url(#end-arrow)')
      .classed(consts.selectedClass, function(d){
        return d === state.selectedEdge;
      })
      .attr("d", function(d){
        return "M" + d.source.x + "," + d.source.y + "L" + d.target.x + "," + d.target.y;
      });

    // add new paths
    paths.enter()
      .append("path")
      .style('marker-end','url(#end-arrow)')
      .classed("link", true)
      .attr("d", function(d){
        return "M" + d.source.x + "," + d.source.y + "L" + d.target.x + "," + d.target.y;
      })
      .on("mousedown", function(d){
        thisGraph.pathMouseDown.call(thisGraph, d3.select(this), d);
        }
      )
      .on("mouseup", function(d){
        state.mouseDownLink = null;
      });

    // remove old links
    paths.exit().remove();

    // update existing nodes
    thisGraph.circles = thisGraph.circles.data(thisGraph.nodes, function(d){
      return d.id;
    });
    thisGraph.circles.attr("transform", function(d){return "translate(" + d.x + "," + d.y + ")";});

    // add new nodes
    var newGs= thisGraph.circles.enter()
          .append("g");

    newGs.classed(consts.circleGClass, true)
      .attr("transform", function(d){return "translate(" + d.x + "," + d.y + ")";})
      .on("mouseover", function(d){
        if (state.shiftNodeDrag){
          d3.select(this).classed(consts.connectClass, true);
        }
      })
      .on("mouseout", function(d){
        d3.select(this).classed(consts.connectClass, false);
      })
      .on("mousedown", function(d){
        thisGraph.circleMouseDown.call(thisGraph, d3.select(this), d);
      })
      .on("mouseup", function(d){
        thisGraph.circleMouseUp.call(thisGraph, d3.select(this), d);
      })
      .call(thisGraph.drag);

    newGs.append("circle")
      .attr("r", String(consts.nodeRadius));

    newGs.each(function(d){
      thisGraph.insertTitleLinebreaks(d3.select(this), d.title);
    });

    // remove old nodes
    thisGraph.circles.exit().remove();
  };

  GraphCreator.prototype.zoomed = function(){
    this.state.justScaleTransGraph = true;
    d3.select("." + this.consts.graphClass)
      .attr("transform", "translate(" + d3.event.translate + ") scale(" + d3.event.scale + ")");
  };

  GraphCreator.prototype.updateWindow = function(svg){
    var docEl = document.documentElement,
        bodyEl = document.getElementsByTagName('body')[0];
    var x = window.innerWidth || docEl.clientWidth || bodyEl.clientWidth;
    var y = window.innerHeight|| docEl.clientHeight|| bodyEl.clientHeight;
    svg.attr("width", x).attr("height", y);
  };

  // extend the d3 GraphCreator class for persistent graphs
  // manage the persistence replica instance
  // create if necessary on reference and/or refresh should connection information change
  GraphCreator.prototype.ensureReplica = function() {
    if (! this.replica) {
      console.log('new replica');
      this.replica = graphDatabase.GraphDatabase.open("d3 graph", this.location(), this.authentication(),
                       {databaseClass: rdfDatabase.RDFDatabase,
                        environment: (new rdfEnvironment.RDFEnvironment({context: GraphCreator.jsonContext,
                                                                         module: GraphCreator.module})),
                        asynchronous: true
                        });
      this.replica.createObjectStore('default');
      console.log('ensureReplica: new replica');
    } else {
      // console.log('ensureReplica: old replica');
    }
    // console.log('ensureReplica complete');
    return (this.replica);
  }

  GraphCreator.jsonContext =
    {'@base': "http://example.org/schema#",
     '@type': { '@type': "@id", '@id': "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"},
      uuid: { '@type': "@id", '@id': "uuid"},
      x: { '@type': "integer", '@id': "x"},
      y: { '@type': "integer", '@id': "y"},
      title: { '@type': "string", '@id': "title"},
      sourceIdentifier: { '@type': "@id", '@id': "sourceIdentifier"},
      targetIdentifier: { '@type': "@id", '@id': "targetIdentifier"}};

  GraphCreator.module = {'Node': Node, 'Edge': Edge};
    
  GraphCreator.prototype.location = function(protocol = 'https') {
    return (protocol + '://' + this.host() + '/' + this.repositoryId());
  }
  GraphCreator.prototype.host = function() {
    return (document.getElementById('host').value);
  }
  GraphCreator.prototype.repositoryId = function() {
    return (document.getElementById('repository').value);
  }
  GraphCreator.prototype.authentication = function() {
    return (document.getElementById('authentication').value);
  }
  GraphCreator.prototype.loadNode = function(uuid) {
    var node = this.nodes.find(function (node) { return (node.uuid == uuid); })
      || new Node(this, null, null, null, uuid);
    console.log("loadNode", uuid, node);
    this.replica.findObjectStore('default').get(node);
    this.replica.findObjectStore('default').attach(node);
  }

  GraphCreator.prototype.loadEntityIds = function() {
    var location = this.location();
    var authentication = this.authentication();
    var thisGraph = this;
    SPARQL.get(location,
               "select distinct ?id where {?s a 'Node' . ?s <http://example.org/uuid> ?id }",
               {"authentication": authentication,
                "Accept": "application/sparql-results+json"},
      function(response) {
        response.text().then(function(text) {
          // console.log("loadEntityIds: text ",text);
          var listElement = document.getElementById('entityList');
          var json = JSON.parse(text);
          // console.log('loadEntityIds: json: ', json);
          var bindings = json['results']['bindings'];
          listElement.innerHTML = '';
          bindings.forEach(function(solution) {
            var re = document.createElement('div');
            var id = solution['id']['value'];
            try {
              re.addEventListener('click', function(e) {thisGraph.displaySelectedNodeByID(e);}, false);
              re.onmouseover = function(e) { re.style.textDecoration = 'underline'};
              re.onmouseout = function(e) { re.style.textDecoration = 'none'};
            } catch (error) {
              console.log("element creation! ", error);
            }
            re.appendChild(document.createTextNode(id));
            listElement.appendChild(re);
          });
        });
      }
    );
  }

  GraphCreator.prototype.displaySelectedNodeByID = function(event) {
    var div = event.target;
    var id = div.innerText;
    this.loadNode(id);
  }

  /*GraphCreator.prototype.getNodeByID = function(id) {
    var location = this.location();
    var authentication = this.authentication();
    var query = 'describe <http://example.org/' + id + '>';
    console.log("query ", query);
    SPARQL.get(location,
               query,
               {"authentication": authentication,
                "Accept": "application/n-quads"},
      function(response) {
        response.text().then(function(text) {
          console.log("gotten: ", text);
        });
      });
  }*/


  /**** MAIN ****/

  // warn the user when leaving
  window.onbeforeunload = function(){
    return "Make sure to save your graph locally before leaving :-)";
  };

  var docEl = document.documentElement,
      bodyEl = document.getElementsByTagName('body')[0];

  var width = window.innerWidth || docEl.clientWidth || bodyEl.clientWidth,
      height =  window.innerHeight|| docEl.clientHeight|| bodyEl.clientHeight;

  var xLoc = width/2 - 25,
      yLoc = 100;

  // initial node data
  var nodes = [];
  var edges = [];


  /** MAIN SVG **/
  var svg = d3.select(settings.appendElSpec).append("svg")
        .attr("width", width)
        .attr("height", height);
  var graph = new GraphCreator(svg, nodes, edges);
  graph.setIdCt(0);
  graph.updateGraph();
};

class Edge extends graphObject.GraphObject {
  constructor(graph, source, target) {
    super(...arguments);
  }
  initializeInstance(graph, source, target) {
    super.initializeInstance();
    this._identifier = "http://example.org/" + graph.replica.makeUUID();
    this.source = source;
    this.sourceIdentifier = source.identifier;
    this.target = target;
    this.targetIdentifier = target.identifier;
  }
  get identifier() { return (this._identifier); }
  set identifier(iri) { this._identifier = iri; return (iri); }
}
Edge._persistentProperties = ['sourceIdentifier', 'targetIdentifier'];

class Node extends graphObject.GraphObject {
  constructor(graph, title, x, y) {
    super(...arguments);
  }
  initializeInstance(graph, title, x, y, uuid = graph.replica.makeUUID()) {
    super.initializeInstance();
    this.uuid = uuid;
    this._identifier = "http://example.org/" + this.uuid;
    this.id = graph.idct++;
    this.title = title;
    this.x = x;
    this.y = y;
  }
  get identifier() { return (this._identifier); }
  set identifier(iri) { this._identifier = iri; return (iri); }
  oncreate(deltas) {
    console.log("Node.oncreate", deltas, this);
    super.oncreate(deltas);
    var id = window.GCI.nodes.indexOf(this);
    if (id < 0) {
      id = window.GCI.nodes.length;
      window.GCI.nodes.push(this);
    }
    this.id = id;
    window.GCI.ensureReplica().findObjectStore('default').attach(this);
    window.GCI.updateGraphView();
  }
  onupdate(deltas) {
    console.log("Node.onupdate", deltas, this);
    super.onupdate(deltas);
    var id = window.GCI.nodes.indexOf(this);
    if (id < 0) {
      id = window.GCI.nodes.length;
      window.GCI.nodes.push(this);
    }
    this.id = id;
    window.GCI.updateGraphView();
  }
}

Node._persistentProperties = ['uuid', 'title', 'x', 'y'];


(function() {
  var oldonload = window.onload;
  window.onload = function() {
    if (typeof oldonload == 'function') {
      oldonload(...arguments);
    }

    var host = prompt("host: ", document.getElementById('host').value);
    var repositoryId = prompt("repository id: ", document.getElementById('repository').value);
    if (repositoryId != document.getElementById('repository').value ||
        host != document.getElementById('host').value) {
      document.getElementById('host').value = host;
      document.getElementById('repository').value = repositoryId;
      var authentication = prompt("authentication: ", document.getElementById('authentication').value);
      document.getElementById('authentication').value = authentication;
    }
    runGraphCreator(window.d3);
    window.GCI.loadEntityIds();
  }
}());

