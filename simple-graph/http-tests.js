export { HTTP_API_Tests };
class HTTP_API_Tests {

    constructor(location, authentication) {
        this.location = location;
        this.authentication = authentication; 
    }



    //generalized GET -- json
    //TODO pass non-encoded URL as parameter for readability
    GET_generalized_test(getTestName, paramUriEnc, acceptHeader) {
        const DOM_update = function (testname, result) {

            var ul = document.getElementById("testResults");
            var li = document.createElement("li");
            li.appendChild(document.createTextNode(testname + " : " + result));
            ul.appendChild(li);
        }

        const continuationGet = function (json) {
            debugger;
            window.console.log('json ', json);
            window.console.log('json.results.bindings.length', json.results.bindings.length);

            const testResult = json.results.bindings.length == 1;
            DOM_update(getTestName, testResult);

        }

        const getGeneralizedCallback = function (response) {
            debugger;
            response.json().then(continuationGet);
        }

        const uriEnc = paramUriEnc;
        const uriDec = decodeURIComponent(uriEnc);

        const authKvp = {
            "authentication": this.authentication,
            "Accept": acceptHeader
        };

        SPARQL.get(this.location,
            uriDec,
            authKvp,
            getGeneralizedCallback
        );
        debugger;
    }


    //#! /bin/bash
    //# verify the accept order is observed
    //curl_sparql_request \
    //-H 'Accept: application/sparql-results+json,application/sparql-results+xml,*/*;q=0.9' \
    //'query=select%20count(*)%20where%20%7b?s%20?p%20?o%7d' \
    //| jq '.results.bindings[] | .[].value' | fgrep - q '"1"'

    GET_count_srj_plus_srx_test() {
        const testName = 'GET_count_srj_plus_srx_test';
        const paramUriEnc = 'select%20count(*)%20where%20%7b?s%20?p%20?o%7d';
        const acceptHeader = 'application/sparql-results+json,application/sparql-results+xml,*/*;q=0.9';

        this.GET_generalized_test(
            testName,
            paramUriEnc,
            acceptHeader);
    }


    //curl_sparql_request \
    //-H "Accept: application/sparql-results+json" \
    //'query=select%20(count(*)%20as%20%3Fcount)%20where%20%7B%3Fs%20%3Fp%20%3Fo%7D' \
    //| jq '.results.bindings | .[].count.value' \
    //| fgrep - q '"1"'

    GET_count_srj_test() {

        const testName = 'GET_count_srj_test';
        const paramUriEnc = 'select%20(count(*)%20as%20%3Fcount)%20where%20%7B%3Fs%20%3Fp%20%3Fo%7D';
        const acceptHeader = 'application/sparql-results+json';

        this.GET_generalized_test(
            testName,
            paramUriEnc,
            acceptHeader);

    }




    //generalized GET -- XML 
    //TODO pass non-encoded URL as parameter for readability
    GET_generalized_test_XML(getTestName, paramUri, acceptHeader) {

        const location = graphUI.location(); //same
        const authentication = graphUI.authentication(); //same
        
        const authKvp = {
            "authentication": authentication,
            "Accept": acceptHeader
        };

        const DOM_update = function (testname, result) {

            var ul = document.getElementById("testResults");
            var li = document.createElement("li");
            li.appendChild(document.createTextNode(testname + " : " + result));
            ul.appendChild(li);
        }


        const continuationGetXML = function (XML) {
            //window.console.log('XML: ', XML);

            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(XML, "text/xml");
            const x = xmlDoc.getElementsByTagName(
                "literal")[0].childNodes[0].nodeValue;

            window.console.log('x: ', xmlDoc);
            window.console.log('x: ', x);
            //debugger;
        }

        const getGeneralizedCallbackXML = function (response) {
            response.text().then(continuationGetXML);
        }

        SPARQL.get(location,
            paramUri,
            authKvp,
            getGeneralizedCallbackXML
        );
    }

    GET_count_srx_test() {
        //curl_sparql_request - H "Accept: application/sparql-results+xml" 'query=select%20count(*)%20where%20%7b?s%20?p%20?o%7d' \
        //| xmllint--c14n11 - \
        //| tr - s '\t\n\r\f' ' ' | sed 's/ +/ /g' \
        //| fgrep - i 'variable name="count1"' \
        //| egrep - i - q - s '<binding name="count1">.*<literal .*>1</literal>'

        const getTestName1 = 'GET_count_srx_test';
        const paramUri1 = 'select count(*) where {?s ?p ?o}';
        const acceptHeader1 = 'application/sparql-results+xml';
        this.GET_generalized_test_XML(getTestName1, paramUri1, acceptHeader1);

    }

    GET_count_tsv_test() {
        //#! /bin/bash

        //curl_sparql_request - H "Accept: text/tab-separated-values" 'query=select%20count(*)%20where%20%7b?s%20?p%20?o%7d' \
        //| tr - s '\n' '\t' \
        //| egrep - q - s 'COUNT1.*1'

        const getTestName1 = 'GET_count_tsv_test';
        const paramUri1 = 'select%20count(*)%20where%20%7b?s%20?p%20?o%7d';
        const acceptHeader1 = 'text/tab-separated-values';
        
        const DOM_update = function (testname, result) {

            var ul = document.getElementById("testResults");
            var li = document.createElement("li");
            li.appendChild(document.createTextNode(testname + " : " + result));
            ul.appendChild(li);
        }

        const continuationGetTSV = function (response) {
            const testResult = /COUNT1\n\"1"/i.test(response);
            DOM_update(getTestName1, testResult);
        }
        
        const getGeneralizedCallback = function (response) {
            debugger;
            window.console.log(response.text);
            response.text().then(continuationGetTSV);
        }

        const uriEnc = paramUri1;
        const uriDec = decodeURIComponent(uriEnc);

        const authKvp = {
            "authentication": this.authentication,
            "Accept": acceptHeader1
        };

        SPARQL.get(this.location,
            uriDec,
            authKvp,
            getGeneralizedCallback
        );

    }


    RunAll() {
        //GET-srx.sh
        //GET - count - tsv.sh
        //GET - count - srx.sh -- DONE. 
        //GET - count - srj.sh -- DONE. 
        //GET - count - srj + srx.sh -- DONE ++
        //GET - count - csv.sh -- ORIGINAL.
        //GET - construct - srx - 406.sh
        //GET - construct - rdfxml.sh
        //GET - anon - srj.sh

        this.GET_count_tsv_test();

        


        this.GET_count_srx_test();
        this.GET_count_srj_test();
        this.GET_count_srj_plus_srx_test();


    }









































































        //const continuationGet = function (json) {
        //    window.console.log('json ', json);
        //    window.console.log('json.results.bindings.length', json.results.bindings.length);
        //    testResults["GET_count_srj_test"] = (json.results.bindings.length === 1);
        //    //debugger;
        //}

        //const getEntitiesGetCountSrjTestCallback = function (response) {
        //    response.json().then(continuationGet);
        //}

        //const location = this.location; //same
        //const authentication = this.authentication; //same
        //const uriEnc = 'select%20(count(*)%20as%20%3Fcount)%20where%20%7B%3Fs%20%3Fp%20%3Fo%7D';
        //const uriDec = decodeURIComponent(uriEnc);

        //const authKvp = {
        //    "authentication": authentication,
        //    "Accept": "application/sparql-results+json"
        //};

        //SPARQL.get(location,
        //    uriDec,
        //    authKvp,
        //    getEntitiesGetCountSrjTestCallback
        //);
    //}



    //getEntitiesGET_count_srj() {
    //    const location = this.location;
    //    const authentication = this.authentication;
    //    var contentElement = window.document.getElementById('content'); 
    //    var thisGraphUi = window.graphUI;

    //    const uriEnc = 'select%20(count(*)%20as%20%3Fcount)%20where%20%7B%3Fs%20%3Fp%20%3Fo%7D';
    //    const uriDec = decodeURIComponent(uriEnc);

    //    SPARQL.get(location,
    //        uriDec,
    //        {
    //            "authentication": authentication,
    //            "Accept": "application/sparql-results+json"
    //        },
    //        function (response) {
    //            // console.log("response ", response);
    //            response.text().then(function (text) {
    //                contentElement.value = text;
    //                var listElement = window.document.getElementById('entitylist');
    //                const json = JSON.parse(text);

    //                window.console.log('json ', json);
    //                window.console.log('json.results.bindings.length', json.results.bindings.length);
    //                const bindings = json['results']['bindings'];
    //                listElement.innerHTML = '';
    //                bindings.forEach(function (solution) {
    //                    const re = window.document.createElement('div');
    //                    const id = solution['s']['value'];
    //                    // console.log("addEventListener-", re, id);
    //                    try {
    //                        re.addEventListener('click', thisGraphUi.displaySelectedNodeByID, false);
    //                    } catch (error) {
    //                        window.console.log("addEventListener! ", error);
    //                    }
    //                    //console.log("addEventListener+");
    //                    re.appendChild(window.document.createTextNode(id));
    //                    listElement.appendChild(re);
    //                });
    //            });
    //        }
    //    );
    //}



}