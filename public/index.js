$(function() {
  "use strict";

  // Apply colors to form headers.
  $("form > div").each((idx, div1) => {
    $("> h3", div1).addClass("text-primary");
    $("> div", div1).each((idx, div2) => {
      $("> h4", div2).addClass("text-info");
      $("> div", div2).each((idx, div3) => {
        $("> h5", div3).addClass("text-success");
      });
    });
  });
/*  $('.selectpicker').selectpicker({
    iconBase: 'fontawesome',
  })
  $("#saveForm select").each((idx, select) => {
    select.title = ["单选", "多选"][~~select.multiple];
  });
  $("#saveForm select").selectpicker('refresh'); // Or use 'render'. Don't know the difference between 'render' and 'refresh'. https://developer.snapappointments.com/bootstrap-select/methods */
  $('.date input').datepicker({ // https://eternicode.github.io/bootstrap-datepicker/
    language: "zh-CN",
    autoclose: true,
    todayHighlight: true,
    daysOfWeekHighlighted: "0,6",
  });
//  $('#到院时间').datetimepicker({ // https://eonasdan.github.io/bootstrap-datetimepicker/
//    locale: 'zh-CN',
//  });

  const saveForm = $('#saveForm');
  const traverseDOM = (element, doc, cbInput, cbElement, cbDiv) => {
    let inner = true;
    const divs = $(">div", element); // Selects all direct child elements. https://api.jquery.com/child-selector/
    divs.each((idx, div) => {
      if (div.id.length) inner = false;
    });
    if (inner) {
      $(":input", element).each((idx, input) => {
        if (input.nodeName === "BUTTON") return;
        console.assert(input.nodeName === "INPUT" || input.nodeName === "SELECT");
        if (doc[input.id] === undefined) doc[input.id] = "";
        cbInput(input, doc);
      });
      if (cbElement) cbElement(element, doc);
      return;
    }
    divs.each((idx, div) => {
      if (!div.id.length) return;
      if (doc[div.id] === undefined) doc[div.id] = {};
      if (cbDiv) cbDiv(div, doc);
      traverseDOM(div, doc[div.id], cbInput, cbElement, cbDiv);
    });
    return doc;
  };

  const refreshRecords = () => {
    $.ajax({
      type: "GET",
      url: "records",
      data: { // Specify the DB query's projection.
        '基线登记.基本信息.住院号': 1,
        '基线登记.发病情况.到院时间': 1,
      },
      dataType: "json",
      success: (recordArr, textStatus, jqXHR) => {
        $("#现有记录 option").remove();
        recordArr.forEach((record) => {
          $('#现有记录').append($('<option>', {
              text: `${record["基线登记"]["发病情况"]["到院时间"]} ${record["基线登记"]["基本信息"]["住院号"]}`,
              value: record["基线登记"]["基本信息"]["住院号"],
          }));
        });
        $('#现有记录').selectpicker('refresh');
      },
    });
  };
  refreshRecords();
  $('#现有记录').on('changed.bs.select', function (event, clickedIndex, isSelected, previousValue) { // Not using lambda here to preserve this binding
    $.ajax({
      type: "GET",
      url: "record",
      data: {
        "基线登记.基本信息.住院号": this.value,
      },
      dataType: "json",
      success: (record, textStatus, jqXHR) => {
        if (!record) return; // This should not occur.
        // Traverse the form's DOM to refresh its input values to the record.
        traverseDOM(saveForm, record, (input, doc) => {
          if (input.nodeName === "INPUT") {
            $(input).val(doc[input.id]);
          } else {
            $(input).selectpicker('val', doc[input.id]);
          }
        });
      },
    });
  });

  let exptButton = $('#exptButton');
  exptButton.on('click', (event) => {
    event.preventDefault();
    $.ajax({
      type: "GET",
      url: "records",
//      data: {}, // If 'data' is not specified, the default value is {}.
      dataType: "json",
      success: (recordArr, textStatus, jqXHR) => {
        if (!recordArr.length) return;
        saveAs(new File([
          // Traverse the form's DOM to generate a header row
          (() => {
            let headers = [], branches = [];
            traverseDOM(saveForm, {}, (input) => {
              headers.push(branches.concat(input.id));
            }, () => {
              branches.pop();
            }, (div) => {
              branches.push(div.id);
            });
            return headers.map((branches) => {
              return branches.join('.');
            });
          })(),
          // Traverse the form's DOM to project fields onto the record to generate content rows
          ...recordArr.map((record) => {
            let contents = [];
            traverseDOM(saveForm, record, (input, doc) => {
              if (typeof doc[input.id] === "string") {
                contents.push(doc[input.id]);
              } else if (Array.isArray(doc[input.id])) {
                contents.push(`[${doc[input.id].map((val) => {
                  return `""${val}""`; // The csv parser accepts that data that complies with RFC RFC 4180. As a result, backslashes are not a valid escape character. If you use double-quotes to enclose fields in the CSV data, you must escape internal double-quote marks by prepending another double-quote. https://docs.mongodb.com/manual/reference/program/mongoimport/
                }).join(',')}]`);
              }
            });
            return contents;
          })].map((line) => {
          return line.map((val) => {
            return `"${val}"`;
          }).join(',') + '\n';
        }), "现有记录.csv", {
          type: "text/plain; charset=utf-8",
        }));
      },
    });
  });

/* Use jsPDF to generate a pdf file. Chinese is supported via .text() but not .fromHTML(), so need to reconstruct the form.
  var doc = new jsPDF();
  doc.setFont('TTTGB-Medium');
  doc.text(15, 30, '脑');
  doc.fromHTML($('#saveForm').html(), 15, 15, {});
  doc.save('form.pdf');
*/

  let saveButton = $('#saveButton');
  saveButton.on('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
/*    let v = new validator({
    });
    if (false
    )
      return;
    }*/
    if (!$("#saveForm.needs-validation")[0].checkValidity()) {
      $('html, body').animate({
        scrollTop: $('#saveForm.needs-validation :input[required]').filter((idx, input) => { // Find required inputs that have no value inputted
          return !input.checkValidity();
        }).first().parent().offset().top,
      });
      $('#saveForm').addClass("was-validated");
      return;
    }
    // Disable the submit button for a while
    saveButton.prop('disabled', true);
    // Traverse the form's DOM to generate a document to be inserted.
    const record = traverseDOM(saveForm, {}, (input, doc) => {
      if (input.nodeName === "INPUT") {
        doc[input.id] = input.value;
      } else {
        doc[input.id] = $(input).selectpicker('val'); // .selectpicker('val') returns a singular value for multiple="false" and an array of values for multiple="true"
      }
    });
    // Post a new record with server side validation
    const saveButtonModal = $('#saveButtonModal');
    $.ajax({
      type: "POST",
      url: "record",
      data: record,
      dataType: "json",
      success: (res, textStatus, jqXHR) => {
        if (res.result) {
          saveButtonModal.find('.modal-title').text("保存成功");
          saveButtonModal.find('.modal-body').text(JSON.stringify(res.result));
          refreshRecords();
        } else if (res.errmsg) {
          saveButtonModal.find('.modal-title').text("保存失败");
          saveButtonModal.find('.modal-body').text(res.errmsg);
        }
        saveButtonModal.modal('show');
/*        var keys = Object.keys(res);
        // If server side validation fails, show the tooltips
        if (keys.length) {
          keys.forEach(function(key) {
            $('#' + key + '_label').tooltip('show');
          });
        } else {
          // success
        }*/
      },
    }).always(() => {
      saveButton.prop('disabled', false);
    });
  });

});
