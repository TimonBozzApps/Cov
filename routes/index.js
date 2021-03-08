var express = require('express');
var router = express.Router();
var unirest = require('unirest');
var fs = require('fs');
var xlsxFile = require('read-excel-file/node');

const COOKIE_OPTIONS = {
    maxAge: 100 * 24 * 60 * 60 * 1000,
}

/* GET home page. */
router.get('/', async function(req, res, next) {
    var bundesland = req.query.bundesland || req.cookies.bundesland || "NI";
    var area = req.query['area'+bundesland] || req.cookies['area'+bundesland];

    var path = __dirname+"/accesslog.txt";
    var accessData = fs.readFileSync(path, "utf-8");
    accessData += "\n["+(new Date()).toISOString()+"] "+bundesland+" > "+area;
    fs.writeFileSync(path, accessData)

    var impfData = await impfenData();
    if (bundesland === "II"){
        return res
            .cookie('area'+bundesland, impfData.chosenFact.area, COOKIE_OPTIONS)
            .cookie('bundesland', bundesland, COOKIE_OPTIONS)
            .render('impfungen', impfData);
    }

    return getData(bundesland, area).then((results) => {
        return res
            .cookie('area'+bundesland, results.chosenFact.area, COOKIE_OPTIONS)
            .cookie('bundesland', bundesland, COOKIE_OPTIONS)
            .render('index', results);
    }).catch((error) => {
        if (error.message === "Cookies")
            return res
                .cookie('areaNI', "Gifhorn", COOKIE_OPTIONS)
                .cookie('bundesland', "NI", COOKIE_OPTIONS)
                .render('error', {
                    message: "Cookie-Fehler",
                    error: {
                        status: "Laden Sie die Seite erneut",
                        stack: "",
                    }
                });
        res.render('error', {
            message: "Datenprobleme",
            error: {
                status: "Versuchen Sie es später erneut",
            }
        });
    });
});
module.exports = router;

async function getData(bundesland, area) {
    switch (bundesland) {
        case "NI":
            return niedersachsenData(area);
        case "BY":
            return bayernData(area);
        case "SN":
            return sachsenData(area);
        default:
            throw new Error("Cookies");
    }
}

async function niedersachsenData(area) {
    var casesResponse = await unirest.get('https://www.apps.nlga.niedersachsen.de/corona/iframe.php');
    var casesResponseBody = casesResponse.raw_body;
    var lastUpdate = casesResponseBody.split("<h3 class=\"left\" style=\"margin-top:1rem\">")[1]
        .split("</h3>")[0];
    var tableOnly = casesResponseBody.split("<table class=\"table-region\">")[1]
        .split("<tbody>")[1]
        .split("</tbody>")[0]
        .replace(/<\/td>/g, "")
        .replace(/<\/tr>/g, "")
        .replace(/(<tr [a-z="0-9 ]*>)/g, "<tr>")
        .replace(/(<td [a-z="0-9 ]*>)/g, "<td>")
        .replace(/ align="right"/g, "");
    var rows = tableOnly.split("<tr>");

    var landkreise = [];
    var facts = [];
    var chosenFact;

    rows.forEach((row, index) => {
        if (index === 0)
            return;
        var items = row.split("<td>");
        var landkreis = items[1].trim();
        var fact = {
            area: landkreis,
            totalCases: items[2].trim(),
            totalIncidence: items[3].trim(),
            totalDeaths: items[6].trim(),
            recentCases: items[4].trim(),
            recentIncidence: items[5].trim(),
        }
        landkreise.push(landkreis);
        facts.push(fact);
        if (area === landkreis)
            chosenFact = fact;
    });
    if (chosenFact === undefined)
        chosenFact = facts[0];

    var imageResponse =
        await unirest.get('https://www.niedersachsen.de/Coronavirus/aktuelle-inzidenz-ampel-193672.html');
    var imageLinkSplitArray = imageResponse.raw_body.split("\" border=\"0\" alt=\"Inzidenz-Ampel\" data-brecht=\"StK\">")[0]
        .split("<img src=\"");
    var imageLink = "https://www.niedersachsen.de"
        +imageLinkSplitArray[imageLinkSplitArray.length - 1];
    return {
        bundesland: "NI",
        facts: facts,
        chosenFact: chosenFact,
        lastUpdate: lastUpdate,
        ampelImage: /*imageLink*/ undefined,
        source: "Land Niedersachsen",
    };
}
async function bayernData(area) {
    var casesResponse = await unirest.get('https://www.lgl.bayern.de/gesundheit/infektionsschutz' +
        '/infektionskrankheiten_a_z/coronavirus/karte_coronavirus/index.htm');
    var casesResponseBody = casesResponse.raw_body;
    var lastUpdate = casesResponseBody.split("<li><sup>4)</sup>")[1]
        .split(".</li>")[0].trim();
    var tableOnly = casesResponseBody.split("<!-- Beginn Schleife Datensätze auslesen/ausgeben -->")[1]
        .split("<td><strong>")[0]
        .replace(/<\/td>/g, "")
        .replace(/<\/tr>/g, "");
    var rows = tableOnly.split("<tr>");

    var landkreise = [];
    var facts = [];
    var chosenFact;

    rows.forEach((row, index) => {
        if (index === 0 || index === rows.length-1)
            return;
        var items = row.split("<td>");
        var landkreis = items[1].trim();
        var fact = {
            area: landkreis,
            totalCases: items[2].trim() + " " + items[3].trim(),
            totalIncidence: items[4].trim(),
            totalDeaths: items[7].trim(),
            recentCases: items[5].trim(),
            recentIncidence: items[6].trim(),
        }
        landkreise.push(landkreis);
        facts.push(fact);
        if (area === landkreis)
            chosenFact = fact;
    });
    if (chosenFact === undefined)
        chosenFact = facts[0];

    return {
        bundesland: "BY",
        facts: facts,
        chosenFact: chosenFact,
        lastUpdate: lastUpdate,
        source: "Freistaat Bayern",
    };
}
async function sachsenData(area) {
    var casesResponse = await unirest.get('https://www.coronavirus.sachsen.de/infektionsfaelle-in-sachsen-4151.html');
    var casesResponseBody = casesResponse.raw_body;
    var lastUpdate = "Datenstand " + casesResponseBody.split("<p>Stand: ")[1]
        .split(" Uhr</p>")[0].replace(/,/g, "").replace("&nbsp;", "");
    var tableOnly = casesResponseBody.split("<h3>Laborbestätigte Fälle in den Kreisfreien Städten und in den Landkreisen des Freistaates</h3>")[1]
        .split("<tbody>")[1]
        .split("<td class=\"xl71\" height=\"19\"><strong>Sachsen gesamt</strong></td>")[0]
        .replace(/<\/td>/g, "")
        .replace(/<\/tr>/g, "")
        .replace(/(<tr [a-z="0-9 ]*>)/g, "<tr>")
        .replace(/(<td [a-z="0-9 ]*>)/g, "<td>");
    var rows = tableOnly.split("<tr>");
    var incidenceTableOnly = casesResponseBody.split("<th scope=\"col\">SARS-CoV-2 Nachweise pro 100.000 Einwohner<br>")[1]
        .split("<tbody>")[1]
        .split("<td class=\"xl71\" height=\"19\"><strong>Sachsen gesamt</strong></td>")[0]
        .replace(/<\/td>/g, "")
        .replace(/<\/tr>/g, "")
        .replace(/(<tr [a-z="0-9 ]*>)/g, "<tr>")
        .replace(/(<td [a-z="0-9 ]*>)/g, "<td>");
    var incidenceRows = incidenceTableOnly.split("<tr>");

    var landkreise = [];
    var facts = [];
    var chosenFact;

    rows.forEach((row, index) => {
        if (index === 0 || index === rows.length-1/* || index === rows.length-2*/)
            return;
        var items = row.split("<td>");
        var recentIncidence = incidenceRows[index].split("<td>")[2].trim();
        var landkreis = items[1].replace("<sup>1</sup>", "").trim();
        var fact = {
            area: landkreis,
            totalCases: items[2].trim() + " (" + items[3].trim()+")",
            totalIncidence: items[4].trim(),
            totalDeaths: items[5].trim(),
            recentCases: "N/A",
            recentIncidence: recentIncidence,
        }
        landkreise.push(landkreis);
        facts.push(fact);
        if (area === landkreis)
            chosenFact = fact;
    });
    if (chosenFact === undefined)
        chosenFact = facts[0];

    var imageLink = "https://www.coronavirus.sachsen.de/" + casesResponseBody.split("data-src=\"")[1]
        .split("\"")[0];

    return {
        bundesland: "SN",
        facts: facts,
        chosenFact: chosenFact,
        lastUpdate: lastUpdate,
        ampelImage: imageLink,
        source: "Freistaat Sachsen",
    };
}

var citizens = [
    11100394,
    13124737,
    3669491,
    2521893,
    681202,
    1847253,
    6288080,
    1608138,
    7993608,
    17947221,
    4093903,
    986887,
    4071971,
    2194782,
    2903773,
    2133378,
    83166711,
    83166711
]
async function impfenData(){
    var date = await getImpfenFileDate();
    var path = __dirname+"/"+date+".xlsx";

    var rows = await xlsxFile(path, { sheet: date });
    var rowsSliced = rows.slice(3, 21);
    var impfData = [];
    rowsSliced.forEach((row, index) => {
        var bundesland = row[1];
        var impfGesamt = row[3];
        var impfChange = row[6];
        var impfPercent = impfGesamt / citizens[index] * 100
        var impfChangePercent = impfChange / citizens[index] * 100
        var fact = {
            area: bundesland,
            impfGesamt: CommaFormatted(impfGesamt),
            impfChange: CommaFormatted(impfChange),
            impfPercent: String(+impfPercent.toFixed(2)).replace(".", ","),
            impfChangePercent: String(+impfChangePercent.toFixed(2)).replace(".", ","),
        }
        impfData.push(fact);
    });
    return {
        bundesland: "II",
        facts: impfData,
        chosenFact: impfData[impfData.length-1],
        lastUpdate: "Datenstand: "+date,
        source: "RKI",
        impfLink: true
    };
}
async function getImpfenFileDate(){
    var fileDate = dateFromDate(new Date());
    var path = __dirname+"/"+fileDate+".xlsx";
    if (fs.existsSync(path)){
        return fileDate;
    }
    //https://www.rki.de/DE/Content/InfAZ/N/Neuartiges_Coronavirus/Daten/Impfquotenmonitoring.xlsx;?__blob=publicationFile
    var impfungResponse = await
        (unirest.get('https://www.rki.de/DE/Content/InfAZ/N/Neuartiges_Coronavirus/Daten/Impfquotenmonitoring.xlsx;?__blob=publicationFile').encoding(null));
    const data = Buffer.from(impfungResponse.raw_body);

    var tempPath = __dirname+"/temp.xlsx";
    fs.writeFileSync(tempPath, data, 'binary');
    var sheets = await xlsxFile(tempPath, { getSheets: true });

    if (sheets[1].name !== fileDate){ //if the file is not today
        fs.unlinkSync(tempPath); //remove that file
        fileDate = sheets[1].name; //update date accordingly
    }
    path = __dirname+"/"+fileDate+".xlsx";
    fs.writeFileSync(path, data, 'binary');
    return fileDate;
}
function dateFromDate(date){
    var dd = String(date.getDate()).padStart(2, '0');
    var mm = String(date.getMonth() + 1).padStart(2, '0'); //January is 0!
    var yy = String(date.getFullYear()).substring(2);

    return dd + '.' + mm + '.' + yy;
}
function CommaFormatted(amount) {
    var delimiter = "."; // replace comma if desired
    var i = amount;
    if(isNaN(i)) { return ''; }
    var minus = '';
    if(i < 0) { minus = '-'; }
    i = Math.abs(i);
    var n = new String(i);
    var a = [];
    while(n.length > 3) {
        var nn = n.substr(n.length-3);
        a.unshift(nn);
        n = n.substr(0,n.length-3);
    }
    if(n.length > 0) { a.unshift(n); }
    n = a.join(delimiter);
    amount = minus + n;
    return amount;
}