"use strict";

function onLineSellout(base, lineVals, ...args) {
    let rec = {
        ProdType: args[0],
        ArtikelID: lineVals[10],
        EanKoda: lineVals[11],
        ArtikelNaziv: lineVals[12],
        BlagovnaZnamkaID: parseInt(lineVals[13]),
        BlagovnaZnamkaNaziv: lineVals[14],
        BlagovnaSkupinaNaziv1: lineVals[0],
        BlagovnaSkupinaNaziv2: lineVals[1],
        BlagovnaSkupinaNaziv3: lineVals[2],
        BlagovnaSkupinaNaziv4: lineVals[3],
        BlagovnaSkupinaID1: lineVals[4],
        BlagovnaSkupinaID2: lineVals[5],
        BlagovnaSkupinaID3: lineVals[6],
        BlagovnaSkupinaID4: lineVals[7],
        ID_BRICK: lineVals[8],
        NAZIV_BRICK: lineVals[9]
    };
    base.store("BBProduct").push(rec);
    rec = {
        soldProduct: { ArtikelID: lineVals[10] },
        DAN: new Date(lineVals[22].split(" ")[0]),
        Kolicina: parseInt(lineVals[18]),
        ProdajnaCena: parseFloat(lineVals[19]),
        MaloprodajnaCena: parseFloat(lineVals[20]),
        Popust: parseFloat(lineVals[21]),
        ProdajniKanal2ID: parseInt(lineVals[23]),
        PoslovalnicaID: parseInt(lineVals[24]),
        PoslovalnicaNaziv: lineVals[25],
        PoslovalnicaPostaID: parseInt(lineVals[26]),
        PoslovalnicaPostaNaziv: lineVals[27],
        RegijaNaziv: lineVals[28],
        StatisticnaRegijaNaziv: lineVals[29],
        StatusAbc: lineVals[15],
        StatusBsp: lineVals[16],
        StatusEol: lineVals[17]
    };
    base.store("BBSellout").push(rec);
}

function onLineActivity(base, lineVals) {
    if (base.store("BBProduct").recordByName(lineVals[0])) {
        let discountCat = lineVals[14];
        let discount = parseFloat(lineVals[15]);
        let endPrice = parseFloat(lineVals[16]);
        let startPrice;
        if (discountCat === "P") {
            startPrice = (endPrice * 100) / (100.0 - discount);
        } else if (discountCat === "C") {
            startPrice = endPrice + discount;
            discount = (discount / startPrice) * 100.0;
        } else {
            console.log("Unknown 'POPUSTCENA' category. Used as 'C' category.");
            startPrice = endPrice + discount;
            discount = (discount / startPrice) * 100.0;
        }

        let rec = {
            promotedProduct: { ArtikelID: lineVals[0] },
            ST_AKCIJE: parseInt(lineVals[4]),
            AkcijaID: lineVals[5],
            AkcijaNaziv: lineVals[6],
            StevilkaAkcijeNaziv: lineVals[7],
            KANALOGLAS: lineVals[8],
            KanalOglasevanjaNaziv: lineVals[9],
            ProdajniKatalogID: parseInt(lineVals[10]),
            ProdajniKatalogNaziv: lineVals[11],
            ZAC_DAT: new Date(lineVals[12].split(" ")[0]),
            KON_DAT: new Date(lineVals[13].split(" ")[0]),
            POPUSTCENA: discountCat,
            POPUST: discount,
            ZAC_CE_MA_PRO_A: startPrice,
            KON_CE_MA_PRO_A: endPrice
        };
        base.store("BBActivity").push(rec);
    }
}

function onLineProductProperty(base, lineVals) {
    let rec = {
        propertyOf: { ArtikelID: lineVals[0] },
        PredlogaID: lineVals[4],
        PredlogaNaziv: lineVals[5],
        VRSTNI_RED: parseInt(lineVals[6]),
        OBVEZNOST: parseInt(lineVals[7]),
        LastnostID: parseInt(lineVals[8]),
        LastnostNaziv: lineVals[9],
        VrednostID: parseInt(lineVals[10]),
        VrednostNaziv: lineVals[11]
    };
    base.store("BBProductProperty").push(rec);
}

module.exports = { onLineProductProperty, onLineActivity, onLineSellout };
