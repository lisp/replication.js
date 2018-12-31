// Copyright (c) 2019 datagraph gmbh

/*
 * GraphEnvironment
 *
 * The GraphEnvironment class defines the abstract interface to graphs
 * and their elements.
 */

export class GraphEnvironment {
  constructor(options) {
    //this.context = null;
    this.resolveContext(options['context']);
  }

  get baseIRI() {
    return (this.context['@base'] || null);
  }

  resolveContext(context) {
    var thisEnv = this;
    var expandContext = function(context) {
      var base = context['@base'];
      Object.values(context).forEach(function(def) {
        var uri = def['@id'];
        if (uri) {
          def['@id'] = (base ? new URL(uri, base).href: new URL(uri).href);
        }
      });
      return (context);
    }
    var fetchContext = function(context) {
      fetch(context).then(function(response) {
        thisEnv.context = expandContext(response.json());
      })
    }
    if (context) {
      switch (typeof(context)) {
      case 'object':
        if (context instanceof URL) {
          fetchContext(context.href);
        } else {
          this.context = expandContext(context);
        }
        break;
      case 'string':
        fetchContext(context);
        break;
      default:
        throw (new TypeError(`resolveContext: invalid context: ${context}` ) );
      }
    } else {
      this.context = {};
    }
  }

  // return the identifier for the root node of the graph
  graphResourceID (graph) {
    throw (new Error('GraphEnvironment.fieldResourceID must be implemented'));
  }

  // return the identifers for all nodes in the graph
  graphResourceIDs (graph) {
    throw (new Error('GraphEnvironment.fieldResourceIDs must be implemented'));
  }

  fieldDefinition(identifier) {
    var def;
    switch (typeof(identifier)) {
    case 'string': // field name
      return (this.context[name] || null);
    case 'object': // url
      var namestring = identifier.name;
      def = this.context[namestring];
      if (def) {
        return (def);
      } else {
        var localPart = identifier.localPart();
        def = this.context[localPart];
        if (def) {
          this.context[namestring] = def;
          return (def);
        } else {
          return (this.context[namestring] = {});
        }
      }
    }
  }
  fieldType(identifier) {
    var def = this.fieldDefinition(identifier);
    return (def ? def['@type'] : null)
  }


  findIdentifierName(uri) {
    var uriNamestring = uri.name;
    var fieldName = this.context[uriNamestring];
    if (! fieldName) {
      fieldName = this.context[uriNamestring] = predicateLeaf(uri);
    }
    return ( fieldName );
  }

  findNameIdentifier(name) {
    console.log('fni');
    console.log(this);
    console.log(this.context);
    var uri = null;
    var def = this.context[name];
    console.log('fni: ' + name);
    if (def) {
      uri = def['@id'];
      console.log(uri);
      return (uri || null);
    }
    console.log(uri);
    return (uri);
  }

  computeGraphObject(graph, identifier) {
    throw (new Error('GraphEnvironment.computeGraphObject must be implemented'));
  }
  computeGraphObjects(graph, identifiers) {
    throw (new Error('GraphEnvironment.computeGraphObjects must be implemented'));
  }
  computeObjectGraph(object) {
    throw (new Error('GraphEnvironment.computeObjectGraph must be implemented'));
  }

  createStatement(subject, predicate, object, context) {
    throw (new Error('GraphEnvironment.createStatement must be implemented'));
  }
  createGraph(statements, options) {
    throw (new Error('GraphEnvironment.createGraph must be implemented'));
  }
  createLiteral(value, options) {
    throw (new Error('GraphEnvironment.createLiteral must be implemented'));
  }
  createAnonymousNode(label) {
    throw (new Error('GraphEnvironment.createAnonymousNode must be implemented'));
  }
  createNamedNode(identifier) {
    throw (new Error('GraphEnvironment.createIdentifiedNode must be implemented'));
  }

  createObject(className, state = {}) {
    var defs = {};
    Object.entries(state).map(function([entryKey, entryValue]) {
      defs[entryKey] = {value: entryValue, enumerable: true};
    });       
    var instance = Object.create(className.prototype, defs);
    return( instance );
  } 
}

export function predicateLeaf(uri) {
  var asURL = new URL(url);
  return ( (asURL.hash.length > 0) ? asURL.hash.slice(1) : asURL.pathname.split('/').pop() );
}
