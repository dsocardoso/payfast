var logger = require('../servicos/logger.js');

module.exports = function(app){
    app.get('/pagamentos',function(req,res) {
       res.send('ok'); 
    });

    const PAGAMENTO_CRIADO = 'Criado';
    const PAGAMENTO_CONFIRMADO = 'Confirmado';
    const PAGAMENTO_CANCELADO  = 'Cancelado';

    app.get('/pagamentos/pagamento/:id', function(req,res){
        var id = req.params.id;
        console.log('Consultando pagamento:' + id);
        //log include
        logger.info('Consultando pagamento:' + id);
        // search first in cache if data exists. 
        var memcachedClient = app.servicos.memcachedClient();
        memcachedClient.get('pagamento-' + id, function(erro, retorno){
            if(erro || !retorno){
                console.log('MISS - chave não encontada no cache');
                var connection = app.persistencia.connectionFactory();
                var pagamentoDao = new app.persistencia.PagamentoDao(connection);
                pagamentoDao.buscaPorId(id, function(erro, resultado){
                    if(erro){
                        console.log('erro ao consultar no banco:' + erro);
                        res.status(500).send(erro);
                        return;
                    }
                    else{
                        console.log('pagamento encontrado' + JSON.stringify(resultado));
                        res.json(resultado);
                        return;
                    }
                });
            }else{
                console.log('pagamento encontado no cache'+ JSON.stringify(retorno));
                res.json(retorno);
                return;
            }
        });

    });

    app.delete('/pagamentos/pagamento/:id', function(req,res){
        var pagamento = {};
        var id = req.params.id;
        pagamento.id = id;
        pagamento.status = PAGAMENTO_CANCELADO;
        var connection = app.persistencia.connectionFactory();
        var pagamentoDao = new app.persistencia.PagamentoDao(connection);

        pagamentoDao.atualiza(pagamento, function(erro){
            if(erro){
                res.status(500).send(erro);
                return;
            }
            console.log('pagamento cancelado');
            res.status(204).send(pagamento);
        });
    });

    app.put('/pagamentos/pagamento/:id',function(req,res){
        var pagamento = {};
        var id = req.params.id;
        pagamento.id = id;
        pagamento.status = PAGAMENTO_CONFIRMADO;
        var connection = app.persistencia.connectionFactory();
        var pagamentoDao = new app.persistencia.PagamentoDao(connection);

        pagamentoDao.atualiza(pagamento, function(erro){
            if(erro){
                res.status(500).send(erro);
                return;
            }
            console.log('pagamento atualizado');
            res.send(pagamento);
        });

    });

    app.post('/pagamentos/pagamento',function(req,res){
        //consistencias
        req.assert('pagamento.forma_de_pagamento', 'Forma de Pagamento é obrigatório').notEmpty();
        req.assert('pagamento.valor','Valor é obrigatório e deve ser um decimal').notEmpty().isFloat();
        req.assert('pagamento.moeda', 'Moeda é obrigatória e deve ter 3 caracteres').notEmpty().len(3,3);
        var erros = req.validationErrors();
        
        if(erros){
            console.log('Erros encontrados');
            res.status(400).send(erros);
            return;        
        }
        // recebe as informacoes do body
        
        //var pagamento = req.body;
        var pagamento = req.body['pagamento'];
        console.log('Processando a requisição de um novo pagamento');  
        
        pagamento.status = PAGAMENTO_CRIADO;
        pagamento.data = new Date;

        var connection = app.persistencia.connectionFactory();
        var pagamentoDao = new app.persistencia.PagamentoDao(connection);

        pagamentoDao.salva(pagamento, function(erro, resultado){
            if(erro){
                console.log('Erro ao inserir no banco:' + erro);
                res.status(500).send(erro);
            }
            else{
                pagamento.id = resultado.insertId;
                console.log('pagamento criado');

                // include some informations in cache 
                var memcachedClient = app.servicos.memcachedClient();
                memcachedClient.set('pagamento-' + pagamento.id, pagamento, 60000, function(erro){
                console.log('nova chave adicionada ao cache: pagamento-' + pagamento.id);
                });
                
                 if(pagamento.forma_de_pgamento == 'cartao'){
                    var cartao = req.body['cartao'];
                    console.log(cartao);

                    var clienteCartoes = new app.servicos.CartoesClient();
                    clienteCartoes.autoriza(cartao, function(exception,request,response,retorno){
                        if(exception){
                            console.log(exception);
                            res.status(400).send(exception);
                            return;
                        }
                        console.log(retorno);

                        res.location('/pagamentos/pagamento/' + pagamento.id);

                        var response = {
                            dados_do_pagamento: pagamento,
                            cartao: retorno,
                            links:[
                                {
                                    href:'http://localhost:3000/pagamentos/pagamento' + pagamento.id,
                                    rel: 'confirmar',
                                    method: 'PUT'
                                },
                                {
                                    href:'http://localhost:3000/pagamentos/pagamento' + pagamento.id,
                                    rel: 'cancelar',
                                    method: 'DELETE'
                                }
                            ]
                        }
                        res.status(201).json(response);
                        return;
                    });
                } else{
                res.location('/pagamentos/pagamento' + resultado.insertId);
                
                var response = {
                    dados_do_pagamento: pagamento,
                    links:[
                        {
                            href:'http://localhost:3000/pagamentos/pagamento/' + pagamento.id,
                            rel:'confirmar',
                            method:'PUT'
                        },
                        {
                            href:'http://localhost:3000/pagamentos/pagamento' + pagamento.id,
                            rel:'cancelar',
                            method:'DELETE'
                        }
                    ]
                }
                res.status(201).json(response);
            }
            }
        });
    });     
}