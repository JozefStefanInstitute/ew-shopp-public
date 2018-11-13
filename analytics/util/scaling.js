'use strict';
const qm = require('qminer');
const la = qm.la;
const fs = qm.fs;

class StandardScaler{
    constructor(){
        this.std = new la.Vector();
        this.mean = new la.Vector();        
    }

    load(fin){
        this.std.load(fin);
        this.mean.load(fin);
    }

    save(fout){
        this.std.save(fout);
        this.mean.save(fout);
    }

    fit(X){
        let stds = [], means = [];
        for(let i = 0; i < X.rows; i++){
            let r = X.getRow(i).toArray(); let n = r.length;
            let m = r.reduce((x, y) => x+y)*1.0 / n;
            let std = Math.sqrt(r.map(x => (x-m)*(x-m) / n).reduce((x, y) => x+y));
            stds.push(std); means.push(m);
        }
        this.std = new la.Vector(stds);
        this.mean = new la.Vector(means);        
    }

    transform(Xt){
        let X = Xt.toMat(); // copy matrix
        for(let i = 0; i < X.rows; i++){
            let r = X.getRow(i).toArray(); let n = r.length;
            r = r.map(x => (x - this.mean[i]) / this.std[i]);
            X.setRow(i, new la.Vector(r));
        }
        return X
    }

    fitTransform(Xt){
        this.fit(Xt); 
        return this.transform(Xt);
    }
}

function standardScale(Xt){
    let X = Xt.toMat(); // copy matrix
    for(let i = 0; i < X.rows; i++){
        let r = X.getRow(i).toArray(); let n = r.length;
        let m = r.reduce((x, y) => x+y)*1.0 / n;
        let std = Math.sqrt(r.map(x => (x-m)*(x-m) / n).reduce((x, y) => x+y));
        r = r.map(x => (x - m) / std);
        X.setRow(i, new la.Vector(r));
    }
    return X
}

function minmaxScale(Xt){
    let X = Xt.toMat(); // copy matrix
    for(let i = 0; i < X.rows; i++){
        let r = X.getRow(i).toArray();
        let rMax = Math.max(...r); let rMin = Math.min(...r);
        r = r.map(x => (x - rMin)*1.0 / (rMax - rMin));
        X.setRow(i, new la.Vector(r));
    }
    return X
}

module.exports = { StandardScaler, standardScale, minmaxScale }; 