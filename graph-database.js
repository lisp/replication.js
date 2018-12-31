// Copyright (c) 2019 datagraph gmbh

/*
The classes

    GraphDatabase
    GDBTransaction
    GDBObjectStore

provide the javascript/graph mediation layer in a form which combines the
IndexedDB and JDO APIs. It support the standard operations

    open, close
    transaction
    createObjectStore
    get, put, delete

Additional operators extend IndexedDB semantics to accommodate basic JDO/JPA
behaviour:
    attach, detach
    commit

The application-thread API operators transform between native javascript
objects and graphs to be exchanged as websockets/fetch requests with a remote
graph store which acts as the Graph storage service.
The object<->graph transformation relies on the GraphObject state tracking
and the field<->term mapping mechanisms which a GDBObjectStore delegates
to a GraphEnvironment.

The IndexedDB transaction behaviour is combined with that of JDO.
The former recommendation specifies that, once no further operation is
possible, a transaction commits.

    http://blog.nparashuram.com/2011/11/indexeddb-apis-javascriptnext.html
    https://w3c.github.io/IndexedDB/#async-execute-request

As per the w3c IndexedDB description, operations are queued as requests and
each is run asynchronously, but in turn, in the order created. Upon completion,
to notify the application either onerror or onsuccess is invoked for each
request.
Once a notification returns and no further request is pending, it is
expected that the active transaction have dynamic extent only, that is, the
main thread maintains no control flow which expect the transaction to have
indefinite extent and to be able to an additional request. Under this
assumption, the transaction can be be committed as soon a no request is
pending.
A non-local control transfer from a request notification should abort the
transaction.
When the transaction commits, any managed changes which happen during the
transaction's extent are marshalled and excuted as well, after which instance
specific onsuccess/failure invoked.
In addition to the implicit completion, an explicit commit operation
can apply pending request and managed changes manually.

The put/get functions rely on promises to implement asynchronous behaviour.
see
    https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
For a put operation, the execution function marshals the object state into
a pending request and immediately resolves the promise.
It provides a then function which implements the IndexedDB asynchronous
behaviour by iterating over all accumulated put requests, caching the request
data to be transmitted when the transaction completes and invoking each
request's onsuccess.
For a get request, the execute function initiates the retrieval and
resolves the promise when the response arrives, while the then function
unmarshals the result and invokes the request's onsuccess to the the
data to the application.
When executing the then functions, shuld no request remain, the transaction
is completed. but transmitting all accumulated combined put data and
patches from managed objects.


The default implementation uses the W3C SPARQL and Graph Store Protocols to
communicate with a CRDT-as-RDF service. A GraphEnvironment combines JSON-LD
term/field mapping together with graph manipulation utilites from rdflib
to provie the default implemention of the abstract interface.

*/

import {GraphEnvironment} from './graph-environment.js';
import {GraphObject} from './graph-object.js';
import {NotFoundError} from './errors.js';
import * as $uuid from './revision-identifier.js';

class GraphFactory extends IDBFactory {

  open(name, location, authentication) {
    return (new GraphDatabase(name, location, authentication));
  }

  cmp(iri1, iri2) {}

  deleteDatabase(name) { console.log("deleteDatabase is ignored");}
}

export class GraphDatabase { // extends IDBDatabase {
  constructor(name, location, authentication, options = {}) {
    //super();
    //console.log('GraphDatabase.constructor');
    //console.log(arguments);
    this.name = name;
    this.location = location;
    this.revision = "HEAD";
    this.authentication = authentication;
    this.objectStores = {};
    this.environment = options.environment ||
     new (options.environmentClass || GraphDatabase.graphEnvironmentClass)();
    //console.log(this);
    //console.log(this.objectStores);
    var thisDatabase = this;
    if (location) {
      new Promise(function(resolve, reject) {
        resolve(thisDatabase);
      }).then(function(that) {
        //console.log("inpromise");
        //console.log(thisDatabase);
        //console.log(that);
        thisDatabase.head({}).then(function(response) {
          //console.log("responded");
          //console.log(response);
          //for (var [k,v] of response.headers.entries()) {console.log([k,v])};
          var etag = response.headers.get('etag');
          //console.log(`etag: '${etag}'`);
          if (etag) {
            thisDatabase.revision = etag;
          }
        })
      });
    }
    window.thisDatabase = thisDatabase;
  }
  /*
  GSP.head('https://de8.dydra.com/jhacker/test/service', {},
           function(response) { for (var [k,v] of response.headers.entries()) {console.log([k,v])}})*/

  close() {
    //this.worker.postMessage({operation: "closeDatabase", data: {}});
    //this.worker = null;
  }
  name() {
    return( this.name );
  }

  version() {
    return( this.revision );
  }

  createObjectStore(name, options = {}) {
    //console.log('in gdb createObjectStore');
    //console.log(name);
    if (!name) {
      throw new TypeError("name is required.");
    }
    var environment = options['environment'] || this.environment;
    var old = this.objectStores[name];
    if (old) {
      old.environment = environment;
      return( old );
    } else {
      var newStore = new GDBObjectStore(name, {environment: environment});
      this.objectStores[name] = newStore;
      newStore.database = this;
      //console.log(this.objectStores);
      return( newStore );
    }
  }

  findObjectStore(name) {
    //console.log('in gdb createObjectStore');
    //console.log(name);
    var store = this.objectStores[name];
    if (store) {
      return (store);
    } else {
     throw new NotFoundError(`store not found: database: ${this}, name: ${name}`);
    }
  }

  cloneObjectStore(name) {
    var store = this.findObjectStore(name);
    var clone = Object.assign(Object.create(GDBObjectStore.prototype, {}), store);
    clone.transaction = null;
    return (clone);
  }

  objectStoreNames() {
    return (this.objectStores.keys());
  }

  deleteObjectStore(name) {
    if (!name) {
      throw new TypeError("name is required.");
    }
    if (GraphDatabase.objectStores.contains(name)) {
      var oldStore = GraphDatabase.objectStores[name];
      delete GraphDatabase.objectStores[name];
      return( oldStore );
    } else {
      return( null );
    }
  }

  transaction(names = this.objectStoreNames(), mode) {
    var transaction = new GDBTransaction(this, names, mode);
    return (transaction);
  }

  makeUUID() { // override
    return ($uuid.makeUUIDString());
  }

  describe(keyObject, options, continuation) {
    throw (new Error(`${this.constructor.name}.describe must be defined`));
  }
  get(options, continuation) {
    throw (new Error(`${this.constructor.name}.get must be defined`));
  }
  head(options, continuation) {
    throw (new Error(`${this.constructor.name}.get must be defined`));
  }
  patch(content, options, continuation) {
    throw (new Error(`${this.constructor.name}.patch must be defined`));
  }
  put(content, options, continuation) {
    throw (new Error(`${this.constructor.name}.put must be defined`));
  }
}

GraphDatabase.open = function(name, location, authentication, options = {}) {
  //console.log('in open');
  var result = new (options.databaseClass || GraphDatabase.graphDatabaseClass)(name, location, authentication, options);
  //console.log('opened');
  //console.log(result);
  //console.log(result.constructor.name);
  return (result);
}
GraphDatabase.graphDatabaseClass = GraphDatabase;
GraphDatabase.graphEnvironmentClass = GraphEnvironment;



export class GDBTransaction { // extends IDBTransaction {
  constructor(database, names = [], mode = "readonly") {
    //console.log('transaction.constructor: names');
    //console.log(names);
    if (typeof(names) == 'string') {
      names = [names];
    }
    var thisTransaction = 
      Object.create(GDBTransaction.prototype,
                          {database: {value: database},
                           revisionID: {value: (database.makeUUID())},
                           parentRevisionID: {value: "HEAD"},
                           mode: {value: mode}});
    var stores = names.map(function(name) {
      var store = database.cloneObjectStore(name);
      //console.log(`transaction store for '${name}’`);
      //console.log(store);
      if (store.transaction) {
        throw new Error(`store is already in a transaction: ${thisTransaction}: ${store}.${store.transaction}`);
      } else {
        //console.log('set transaction');
        store.transaction = thisTransaction;
      }
      return (store);
    });
    thisTransaction.stores = stores;
    //console.log('GDBTransaction.constructed');
    //console.log(thisTransaction);
    return (thisTransaction);
  }

  createObjectStore(name, options = {}) {
    var store = database.createObjectStore(name, {environment: (options.environment || this.environment)});
    return( Object.defineProperties(store,
                                          {transaction: {value: this, writable: false}}) );
  }

  objectStore(name) {
    var store = this.stores[name];
    if (store) {
      return (store);
    }
    throw(new NotFoundError(`store not found: '${name}'.`));
  }

  /* commmit
   * generates no additional asynchronous control thread as it is
   * either already in one, as a promise's then function, or
   * an explicit invocation from the application thread should be able
   * to assume that any communication has occurred when the call has returned.
   */
  commit() {
    // iterate over the owned stores;
    // for each, get its delta graph
    var posts = [];
    var puts = [];
    var deletes = [];
    this.stores.forEach(function(store) {
      var patch = store.asPatch();
      deletes = deletes.concat(patch.delete ? patch.delete.statements : []);
      posts = posts.concat(patch.post ? patch.post.statements : []);
      puts = puts.concat(patch.put ? patch.put.statements : []);
    });
    // pass the collected operations through to the remote Graph
    var request = new CommitRequest(this, this);
    var thisTransaction = this;
    var p = this.database.patch({delete: deletes, post: posts, put: puts},
                                {},
                                function(request) {
                                  thisTransaction.cleanObjects();
                                  if (request.onsuccess) {
                                    request.onsuccess(new SuccessEvent("success", "commit", request.result));
                                  }
                                  console.log("commit response");
                                  console.log(request);
                                  return (request);
                                });
    return (request);
  }

  commitIfComplete() {
    if (! this.stores.find(function(store) {
            // if some requests is pending, cannot yet commit the transaction
            return (store.requests.length > 0);
          })) {
      return (this.commit());
    } else {
      return (null);
    }
  }

  cleanObjects () {
    this.stores.forEach(function (store) { store.cleanObjects(); });
  }

/*
  asPatch() {
    var posts = [];
    var puts = [];
    var deletes = [];
    this.database.objects.forEach(function(object) {
      var patch = object.asPatch();
      deletes = deletes.concat(patch.delete || []);
      posts = posts.concat(patch.post || []);
      puts = puts.concat(patch.put || []);
    });
    return ({delete: deletes, post: posts, put: puts});

  }*/

  abort() {
    // revert all attached objects
    this.stores.forEach(function(store) { store.abort(); });
    return (this);
  }

}


export class GDBObjectStore { // extends IDBObjectStore {
  constructor(name, options = {}) {
    // super(name);
    this.name = name;
    this.environment = options.environment;
    this.objects = new Set();
    this.requests = [];
    this.patches = [];
    this.transaction = null;
    this.database = null;
  }

  put(object, key = this.computeKey(object)) {  // single level
    var thisStore = this;
    var request = new PutRequest(this, this.transaction);
    object._state = object.stateNew;
    var p = new Promise(function(accept, reject) {
      var patch = object.asPatch();
      request.result = instance;
      request.patch = patch;
      request.transaction = thisStore.transaction;
      request.result = object;
      this.requests.push(request);
      accept(request);
    });
    p.then(function(requestIgnored) {
      for (request = thisStore.requests.shift();
           request;
           request = this.requests.shift()) {
        // allow the onsuccess to push more requests
        this.patches.push(request.patch);
        request.readyState = "complete";
        if (request.onsuccess) {
          request.onsuccess(new SuccessEvent("success", "put", request.result));
        }
      }
      thisStore.transaction.commitIfComplete();
      return(request);
    }, null);
    return( request );
  }

  // intra-transaction changes are visible?
  //   no: there is no relation between get object id and cached managed objects.
  // needs to be qualified by revision, allowing HEAD, HEAD^^, etc as well as uuid
  // in order to implement roll-back/forward
  get(key) {
    var thisStore = this;
    var request = new GetRequest(this, this.transaction);
    this.requests[key] = request;
    var p = new Promise(function(accept, reject) {
      switch (typeof(key)) {
      case 'string' :
        // retrieve the single instance via from the database
        this.database.get(this.transaction.location,
                          {subject: key, revision: this.transaction.parentRevisionID},
                          function(response) { 
                            accept(parseRDF(response.body));
                          });
        break;
      case 'object' :
        // construct a describe
        this.database.describe(key, {},
                               function(response) { 
                                 accept(parseRDF(response.body));
                               });
        break;
      default :
        return (null);
      }
    });
    switch (typeof(key)) {
    case 'object' :
      p.then(function(quads) {
        request.result = thisStore.environment.computeGraphObjects(quads);
        delete this.requests[key];
        if (request.onsuccess) {
          request.onsuccess(new SuccessEvent("success", "get", request.result));
        }
        thisStore.transaction.commitIfComplete();
      });
      break; 
    case 'string' :
      p.then(function(quads) {
        request.result = thisStore.environment.computeGraphObject(quads, key);
        delete this.requests[key];
        if (request.onsuccess) {
          request.onsuccess(new SuccessEvent("success", "get", request.result));
        }
        thisStore.transaction.commitIfComplete();
      });
      break; 
    }    
    return( request );
  }

  /* if the object is attached, just marks its closure
   * otherwise, generate just the single-level patch.
   */
  delete(object) {
    var thisStore = this;
    var request = new DeleteRequest(this, this.transaction);
    var p = new Promise(function(accept, reject) {
      var store = object._store;
      if (store == thisStore) { // just mark the closure
        var deleteObject = function(object) {
          object._state = object.stateDeleted;
          object.persistentValues().forEach(deleteChild);
        }
        var deleteChild = function(child) {
          if (child instanceof GraphObject) {
             thisStore.deleteObject(object);
          } else if (child instanceof Array) {
            child.forEach(deleteChild);
          }
        }
        deleteObject(object);
        request.patch = {};
      } else {
        object._state = object.stateDeleted;
        request.patch = object.asPatch();
      }
      request.result = object;
      this.requests.push(request);
      accept(request);
    });
    p.then(function(requestIgnored) {
      for (request = thisStore.requests.shift();
           request;
           request = thisStore.requests.shift()) {
        // allow the onsuccess to push more requests
        this.patches.push(request.patch);
        request.readyState = "complete";
        if (request.onsuccess) {
          request.onsuccess(new SuccessEvent("success", "delete", request.result));
        }
      }
      thisStore.transaction.commitIfComplete();
      return(request);
    }, null);
    return( request );
  }

  attach(object) {
    // attach the instance to a store
    var thisStore = this;
    var store = object._store;
    //console.log('attaching');
    //console.log(object);
    //console.log(thisStore);
    if (store) {
      // no error, just stop walking
      //if (transaction != this) {
      //  throw new Error(`Object is already attached: ${this}, ${object}.`);
      //} else {}
    } else if (object instanceof GraphObject) {
      var objects = this.objects;
      var attachChild = function(child) {
        if (child instanceof GraphObject) {
          thisStore.attach(object);
        } else if (child instanceof Array) {
          child.forEach(attachChild);
        }
      }
      if (! objects.has(object)) {
        objects.add(object);
        object._store = thisStore;
        object._transaction = thisStore.transaction;
        object.persistentValues(object).forEach(attachChild);
        //console.log('attached');
      }
    }
    return (object);
  }

  detach(object) {
    var thisStore = this;
    var objects = this.objects;
    var detachChild = function(child) {
      if (child instanceof GraphObject) {
        thisStore.detach(object);
      } else if (child instanceof Array) {
        child.forEach(detachChild);
      }
    }
    if (object._store == this) {
      objects.delete(object);
      object._state = GraphObject.stateNew;
      object._transaction = null;
      object._store = null;
      object.persistentValues(object).forEach(detachChild);
    }
    return (object);
  }

  abort() {
    // revert all attached objects
    this.objects.forEach(function(object) {
      if (object._transaction) { // allow for multiple attachments
        var target = object._self;
        target._transaction = null;
        target._patch.forEach(function(name, values) {
          target[name] = values[1];
        });
      }
    });
    this.objects = new Set();
    return (this);
  }

  asPatch() {
    // collect and return all accumulated patches
    // in the process, convert from abstract form
    //    {put: [[s,p,o] ... ] ...}
    // the encoding specific to the store implementation
    var thisStore = this;
    var posts = [];
    var puts = [];
    var deletes = [];
    this.patches.forEach(function(patch) {
      deletes = deletes.concat(patch.delete || []);
      posts = posts.concat(patch.post || []);
      puts = puts.concat(patch.put || []);
    });
    this.objects.forEach(function(object) {
      var patch = object.asPatch();
      //console.log('asPatch.forEach');
      //console.log(patch);
      deletes = deletes.concat(patch.delete || []);
      posts = posts.concat(patch.post || []);
      puts = puts.concat(patch.put || []);
    });
    return (this.environment.createPatch({delete: deletes, post: posts, put: puts}));
  }

  cleanObjects() {
    var cleanObject = function(object) {
      if (object instanceof GraphObject) {
        var state = object._state;
        object._state = GraphObject.stateClean; 
        return (state != GraphObject.stateDeleted);
      } else { // there should not be anything else
        return (false);
      }
    }
    this.objects = this.objects.forEach(cleanObject);
  }


}

class GraphRequest extends IDBRequest {
  constructor(objectStore, transaction) {
    var r = Object.create(GraphRequest.prototype,
                          {error: {value: GraphRequest.prototype.noErrorProvided},
                           success: {value: GraphRequest.prototype.noSuccessProvided},
                           source: {value: objectStore},
                           readyState: {value: "pending"},
                           transaction: {value: transaction},
                           patch: {value: null},
                           result: {value: null}});
    return (r);
  }
  noErrorProvided() {};
  noSuccessProvided() {};
}

export class PostRequest extends GraphRequest {
}
export class PutRequest extends GraphRequest {
}
export class DeleteRequest extends GraphRequest {
}
export class CommitRequest extends GraphRequest {
}


console.log('Graph-database.js: loaded');