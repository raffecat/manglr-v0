$(document).ready(function() {

    // Wed Aug 2: 5-7pm; 8-1am

    // JSON POST helper

    function postJson(url, data, done, fail) {
      var tries = 0;
      post();
      function post() {
        $.ajax({
          type: "POST",
          url: window.location.protocol+"//"+window.location.host+url,
          data: JSON.stringify(data),
          contentType: "application/json; charset=utf-8",
          dataType: "json",
          success: done,
          error: function(errMsg) {
            tries++;
            if (tries > 5) {
              if (!fail || !fail(errMsg, tries)) return;
            }
            var delay = Math.min(tries * 1000, 30000); // back-off.
            window.setTimeout(post, delay);
          }
        });
      }
    }

    // Clear radio buttons on page load for Firefox.
    $('.js-radio-init').prop('checked','checked');

    // School Class Lists.

    var schools = [
      "St Kilda Primary", [
        "Prep C","Prep S","Prep T","1BA","1BU","1J","1K","1R","2A","2C","2F","2N","2R","3MS","3SA","3O","3V","4J","4KB","4P","5/6D","5C","5K","6E","6Y","Staff"
      ],
      "Ripponlea Primary", [
        "Foundation","1/2 A","1/2 B","1/2 C","3/4 A","3/4 B","3/4 C","5/6 A","5/6 B","5/6 C","5/6 D","Staff"
      ],
      "National Theatre Ballet School", [
        "First year","Second year","Third year"
      ],
      "National Theatre Drama School", [
        "First year","Second year","Third year"
      ]
    ];

    var classIdx = {};
    var lastSchool = "";

    function setOpts(sel, list) {
      $(sel).html("<option selected disabled></option><option>"+list.join("</option><option>")+"</option>");
    }

    !function(){
      var names = [];
      for (var i=0;i<schools.length;i+=2) {
        var nom = schools[i]; names.push(nom); // names.
        classIdx[nom] = schools[i+1]; // class index.
      }
      setOpts('#js-school',names);
    }();

    $('#js-school').on('change', function(){
      var sel = $(this);
      window.setTimeout(function(){ // defer for val()
        var school = sel.val();
        if (school != lastSchool) { // to avoid clearing class selection.
          lastSchool = school;
          setOpts('#js-class',classIdx[school]||[]);
        }
      },0);
    });


    // Fetch the Order Date information.

    var token = "";
    var expires = 0;

    function dateLoaded(data) {
      token = data.token||"";
      expires = (+new Date()) + data.expiresIn; // milliseconds.
      $('#js-order-day').text(data.dayName);
      $('#js-order-date').text(data.bookDate);
      $('#js-orders-loading').finish().hide();
      $('#js-orders-loaded').fadeIn(500);
      if (data.closed) {
        $('#js-orders-closed').fadeIn(500);
      }
      updateSubmitButton(); // enable submit if everything else is ready.
    }

    $('#js-orders-loading').delay(200).fadeIn(500); // only shows if API is slow.

    postJson("/api/begin", {}, dateLoaded, function (msg) {
      return true; // keep trying until it works.
    });

    // Validate the order form.

    var formValid = false;
    var formData = {};

    function updateForm() {
      if (submitting) return;
      formValid = false;
      formData = {};
      var err = "";
      $('.js-field').each(function(){
        var inp = $(this), val = $.trim(inp.val()), name = inp.attr('js-name'), old = formData[name];
        if (!name) throw "name";
        if (old) throw "dup";
        if (inp.attr('required') && !val) {
          if (!err) err = (inp.attr('js-error')||''); // first error.
        }
        formData[name] = val;
      });
      if (err) {
        $('js-top-error').text(err + " in the form above.").fadeIn(500);
        $('js-bottom-error').text(err + " in the form at the top of the page.").fadeIn(500);
      } else {
        $('.js-top-error').hide();
        $('.js-bottom-error').hide();
        formValid = true;
      }
    }

    $('.js-field').on('change blur', function(){
      window.setTimeout(function(){
        updateForm();
        updateSubmitButton(); // enable submit if everything else is ready.
      },0);
    });

    // Order Totals.

    var orderValid = false;
    var order = [];

    function updateOrder() {
      if (submitting) return;
      orderValid = false;
      order = [];
      var total = 0;
      $('.js-radio-init').each(function(){ // each group has one initial radio.
        var val = $('input[name='+this.name+']:checked').val(); // value of checked radio in group.
        if (val) {
          var row = val.split(','), sku=row[0], price=+row[1], qty=+row[2]; // radio value.
          if (!(sku && price>0 && qty>0)) throw "sku";
          total += qty * price; // for client-side display.
          order.push({ sku:sku, qty:qty }); // for server-side order.
        }
      });
      if (total > 0) {
        $('#js-no-total').hide();
        $('#js-total').text((total/100).toFixed(2));
        orderValid = true;
      } else {
        $('#js-no-total').fadeIn(500);
        $('#js-total').html('&mdash;');
      }
    }

    $('input[type=radio]').on('change', function(){
      window.setTimeout(function(){
        updateOrder();
        updateSubmitButton(); // enable submit if everything else is ready.
      },0);
    });

    // Submit Button.

    var submitting = false;

    function updateSubmitButton() {
      if (token && formValid && orderValid) {
        $('#js-submit-btn').fadeTo(200,1).css('cursor',''); // enabled.
        $('#js-ready-to-pay').fadeIn(500);
        return true; // can submit.
      } else {
        $('#js-submit-btn').fadeTo(200,0.5).css('cursor','default'); // disabled.
        $('#js-ready-to-pay').hide();
        return false; // cannot submit.
      }
    }

    function cannotSubmit() {
      // A problem submitting to the server.
      $('#js-please-wait').hide();
      $('#js-cannot-submit').fadeIn(500);
      submitting = false;
      updateForm(); // ensure up to date.
      updateOrder(); // ensure up to date.
      updateSubmitButton();
    }

    $('#js-submit-btn').on('click', function() {
      if (submitting) return;
      updateForm(); // ensure up to date.
      updateOrder(); // ensure up to date.
      if (updateSubmitButton()) { // can submit?
        // Capture order data.
        var data = formData; formData = {}; // take ownership.
        data.order = order; order = []; // take ownership.
        data.token = token;
        // Reset messages.
        $('#js-ready-to-pay').hide();
        $('#js-cannot-submit').hide();
        // Submit the order.
        submitting = true;
        $('#js-submit-btn').fadeTo(200,0.5).css('cursor','default'); // disabled.
        $('#js-please-wait').show();
        postJson("/api/submitOrder", data, function (res) {
          if (!(res && res.url)) return cannotSubmit();
          window.location.href = res.url;
        }, cannotSubmit);
      }
    });

    // Show focus outlines via css when tab key is used.

    $('body').on('keydown', function(e) {
      if (e.key == 'Tab') {
        $('body').addClass('show-focus');
      }
      return true;
    });
    $('body').on('mousedown', function(e) {
      $('body').removeClass('show-focus');
      return true;
    });

 });
